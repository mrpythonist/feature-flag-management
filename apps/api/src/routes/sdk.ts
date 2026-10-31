import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../db';
import { evaluateFlag } from '../lib/evaluate';
import { cacheKey, getCachedConfig, setCachedConfig } from '../lib/cache';

export const sdkRouter = Router();

interface SdkContext {
  environmentId: string;
  environmentName: string;
  projectId: string;
}

interface CachedConfig {
  enabled: boolean;
  rolloutPercentage: number;
  targetedUsers: string[];
}

/**
 * SDK authentication: the `x-sdk-key` header must match an Environment.sdkKey.
 * The key identifies the environment (and its project); SDK callers never
 * learn admin credentials and never see other environments' configs.
 */
async function requireSdkKey(req: Request, res: Response, next: NextFunction): Promise<void> {
  const sdkKey = req.headers['x-sdk-key'];
  if (typeof sdkKey !== 'string' || sdkKey === '') {
    res.status(401).json({ error: 'missing x-sdk-key header' });
    return;
  }
  const env = await prisma.environment.findUnique({
    where: { sdkKey },
    select: { id: true, name: true, projectId: true },
  });
  if (!env) {
    res.status(401).json({ error: 'invalid sdk key' });
    return;
  }
  req.sdk = { environmentId: env.id, environmentName: env.name, projectId: env.projectId };
  next();
}

sdkRouter.use(requireSdkKey);

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      sdk?: SdkContext;
    }
  }
}

function configFromCache(value: string | null): CachedConfig | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<CachedConfig>;
    if (
      typeof parsed.enabled === 'boolean' &&
      typeof parsed.rolloutPercentage === 'number' &&
      Array.isArray(parsed.targetedUsers)
    ) {
      return {
        enabled: parsed.enabled,
        rolloutPercentage: parsed.rolloutPercentage,
        targetedUsers: parsed.targetedUsers.map(String),
      };
    }
    return null;
  } catch {
    return null;
  }
}

/** Load a flag's config for the SDK environment, via the 60s Redis cache when available. */
async function loadConfig(
  environmentId: string,
  projectId: string,
  flagKey: string,
): Promise<(CachedConfig & { flagKey: string }) | null> {
  const key = cacheKey(environmentId, flagKey);
  const cached = configFromCache(await getCachedConfig(key));
  if (cached) return { ...cached, flagKey };

  const flag = await prisma.flag.findFirst({
    where: { projectId, key: flagKey },
    include: { configs: { where: { environmentId } } },
  });
  const config = flag?.configs[0];
  if (!config) return null;

  const value: CachedConfig = {
    enabled: config.enabled,
    rolloutPercentage: config.rolloutPercentage,
    targetedUsers: config.targetedUsers,
  };
  // Cache-through: populate the cache on miss so repeat evaluations are fast.
  await setCachedConfig(key, JSON.stringify(value), 60);
  return { ...value, flagKey };
}

// ---------------------------------------------------------------------------
// Evaluate
// ---------------------------------------------------------------------------

sdkRouter.get('/evaluate', async (req, res) => {
  const flagKey = typeof req.query.flag === 'string' ? req.query.flag : '';
  const userId = typeof req.query.user === 'string' && req.query.user !== '' ? req.query.user : null;
  if (flagKey === '') {
    res.status(400).json({ error: 'query param "flag" is required' });
    return;
  }
  const { environmentId, environmentName, projectId } = req.sdk!;
  const config = await loadConfig(environmentId, projectId, flagKey);
  if (!config) {
    res.status(404).json({ error: `flag "${flagKey}" not found in this project` });
    return;
  }
  const { enabled, reason } = evaluateFlag(flagKey, userId, config);
  res.json({ flag: flagKey, enabled, reason, environment: environmentName });
});

sdkRouter.post('/evaluate/batch', async (req, res) => {
  const { flags, user } = req.body ?? {};
  if (!Array.isArray(flags) || flags.some((f) => typeof f !== 'string')) {
    res.status(400).json({ error: '"flags" must be an array of flag keys' });
    return;
  }
  if (flags.length > 100) {
    res.status(400).json({ error: 'at most 100 flags per batch request' });
    return;
  }
  if (user !== undefined && user !== null && typeof user !== 'string') {
    res.status(400).json({ error: '"user" must be a string or null' });
    return;
  }
  const userId = typeof user === 'string' && user !== '' ? user : null;
  const { environmentId, environmentName, projectId } = req.sdk!;

  const results = await Promise.all(
    flags.map(async (flagKey: string) => {
      const config = await loadConfig(environmentId, projectId, flagKey);
      if (!config) {
        return { flag: flagKey, enabled: false, reason: 'not-found', environment: environmentName };
      }
      const { enabled, reason } = evaluateFlag(flagKey, userId, config);
      return { flag: flagKey, enabled, reason, environment: environmentName };
    }),
  );
  res.json({ results });
});
