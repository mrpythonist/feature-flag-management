import Redis from 'ioredis';

/**
 * Optional Redis cache for FlagConfigs.
 *
 * If REDIS_URL is unset or the server is unreachable, the API logs a warning
 * and runs entirely without cache — all reads fall through to PostgreSQL and
 * writes are plain no-ops for invalidation. Evaluation itself is always
 * in-process (no per-user evaluation results are cached), because caching
 * per-user outcomes would break rollout semantics when rollouts change.
 */

let client: Redis | null = null;

export function cacheKey(environmentId: string, flagKey: string): string {
  return `ff:config:${environmentId}:${flagKey}`;
}

export async function initCache(): Promise<void> {
  const url = process.env.REDIS_URL;
  if (!url) {
    console.warn('[cache] REDIS_URL not set — running without cache');
    return;
  }
  try {
    const r = new Redis(url, {
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
      // Fail fast: reconnects during request-time calls would just hide outages.
      retryStrategy: () => null,
    });
    r.on('error', (err: Error) => console.warn('[cache] redis error:', err.message));
    await r.ping();
    client = r;
    console.log('[cache] Redis connected — flag config caching enabled');
  } catch (err) {
    console.warn('[cache] Redis unreachable — running without cache:', (err as Error).message);
    client = null;
  }
}

export async function getCachedConfig(key: string): Promise<string | null> {
  if (!client) return null;
  try {
    return await client.get(key);
  } catch (err) {
    console.warn('[cache] get failed:', (err as Error).message);
    return null;
  }
}

export async function setCachedConfig(key: string, value: string, ttlSeconds = 60): Promise<void> {
  if (!client) return;
  try {
    await client.set(key, value, 'EX', ttlSeconds);
  } catch (err) {
    console.warn('[cache] set failed:', (err as Error).message);
  }
}

export async function invalidateConfigKeys(keys: string[]): Promise<void> {
  if (!client || keys.length === 0) return;
  try {
    await client.del(...keys);
  } catch (err) {
    console.warn('[cache] del failed:', (err as Error).message);
  }
}
