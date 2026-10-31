import { Router } from 'express';
import { prisma } from '../db';
import { requireAdmin, signAdminToken } from '../lib/auth';
import { newSdkKey } from '../lib/keys';
import { cacheKey, invalidateConfigKeys } from '../lib/cache';
import { verifyPassword } from '../lib/password';

export const adminRouter = Router();

const SLUG_RE = /^[a-z0-9-]+$/;
const FLAG_KEY_RE = /^[a-z0-9_.-]+$/;

// ---------------------------------------------------------------------------
// Auth (public)
// ---------------------------------------------------------------------------

adminRouter.post('/login', async (req, res) => {
  const { email, password } = req.body ?? {};
  if (typeof email !== 'string' || typeof password !== 'string') {
    res.status(400).json({ error: 'email and password are required' });
    return;
  }
  const user = await prisma.adminUser.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    res.status(401).json({ error: 'invalid credentials' });
    return;
  }
  res.json({
    token: signAdminToken({ sub: user.id, email: user.email, role: user.role }),
    email: user.email,
    role: user.role,
  });
});

adminRouter.use(requireAdmin);

function auditEntry(actor: string, action: string, before: unknown, after: unknown) {
  return {
    actor,
    action,
    before: before === undefined ? undefined : (before as object),
    after: after === undefined ? undefined : (after as object),
  };
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

adminRouter.get('/projects', async (_req, res) => {
  const projects = await prisma.project.findMany({ orderBy: { createdAt: 'asc' } });
  res.json({ projects });
});

adminRouter.post('/projects', async (req, res) => {
  const { name, slug } = req.body ?? {};
  if (typeof name !== 'string' || name.trim() === '' || typeof slug !== 'string' || !SLUG_RE.test(slug)) {
    res.status(400).json({ error: 'name is required and slug must match [a-z0-9-]' });
    return;
  }
  try {
    const project = await prisma.project.create({
      data: {
        name: name.trim(),
        slug: slug.trim(),
        // Provision the three standard environments up front so a project is
        // usable immediately. SDK keys are random; rotate by deleting/adding envs.
        environments: {
          create: ['development', 'staging', 'production'].map((env) => ({
            name: env,
            sdkKey: newSdkKey(),
          })),
        },
      },
      include: { environments: true },
    });
    await prisma.auditLog.create({
      data: {
        projectId: project.id,
        ...auditEntry(req.admin!.email, 'project.created', null, {
          name: project.name,
          slug: project.slug,
        }),
      },
    });
    res.status(201).json({ project });
  } catch (err) {
    res.status(409).json({ error: 'a project with that slug already exists' });
  }
});

async function loadProject(slug: string) {
  return prisma.project.findUnique({
    where: { slug },
    include: { environments: { orderBy: { name: 'asc' } } },
  });
}

adminRouter.get('/projects/:slug/environments', async (req, res) => {
  const project = await loadProject(req.params.slug);
  if (!project) {
    res.status(404).json({ error: 'project not found' });
    return;
  }
  // sdkKey is included on purpose: this is the admin dashboard route.
  // The SDK evaluate routes never expose it.
  res.json({
    environments: project.environments.map((e) => ({
      id: e.id,
      name: e.name,
      sdkKey: e.sdkKey,
      createdAt: e.createdAt,
    })),
  });
});

// ---------------------------------------------------------------------------
// Flags
// ---------------------------------------------------------------------------

adminRouter.get('/projects/:slug/flags', async (req, res) => {
  const project = await prisma.project.findUnique({ where: { slug: req.params.slug } });
  if (!project) {
    res.status(404).json({ error: 'project not found' });
    return;
  }
  const flags = await prisma.flag.findMany({
    where: { projectId: project.id },
    orderBy: { createdAt: 'asc' },
    include: {
      configs: { include: { environment: { select: { id: true, name: true } } } },
    },
  });
  res.json({
    flags: flags.map((f) => ({
      id: f.id,
      key: f.key,
      name: f.name,
      description: f.description,
      createdAt: f.createdAt,
      updatedAt: f.updatedAt,
      configs: f.configs.map((c) => ({
        environmentId: c.environmentId,
        environment: c.environment.name,
        enabled: c.enabled,
        rolloutPercentage: c.rolloutPercentage,
        targetedUsers: c.targetedUsers,
        updatedAt: c.updatedAt,
      })),
    })),
  });
});

adminRouter.post('/projects/:slug/flags', async (req, res) => {
  const { key, name, description } = req.body ?? {};
  if (typeof key !== 'string' || !FLAG_KEY_RE.test(key) || typeof name !== 'string' || name.trim() === '') {
    res.status(400).json({ error: 'key must match [a-z0-9_.-] and name is required' });
    return;
  }
  const project = await loadProject(req.params.slug);
  if (!project) {
    res.status(404).json({ error: 'project not found' });
    return;
  }
  try {
    const flag = await prisma.$transaction(async (tx) => {
      const f = await tx.flag.create({
        data: {
          projectId: project.id,
          key: key.trim(),
          name: name.trim(),
          description: typeof description === 'string' ? description.trim() : '',
          // One config per environment, all disabled by default.
          configs: {
            create: project.environments.map((e) => ({
              environmentId: e.id,
              enabled: false,
              rolloutPercentage: 0,
              targetedUsers: [],
            })),
          },
        },
        include: { configs: true },
      });
      await tx.auditLog.create({
        data: {
          projectId: project.id,
          flagId: f.id,
          ...auditEntry(req.admin!.email, 'flag.created', null, {
            key: f.key,
            name: f.name,
            description: f.description,
          }),
        },
      });
      return f;
    });
    res.status(201).json({ flag });
  } catch {
    res.status(409).json({ error: 'a flag with that key already exists in this project' });
  }
});

adminRouter.put('/projects/:slug/flags/:key', async (req, res) => {
  const { name, description } = req.body ?? {};
  const flag = await prisma.flag.findFirst({
    where: { key: req.params.key, project: { slug: req.params.slug } },
  });
  if (!flag) {
    res.status(404).json({ error: 'flag not found' });
    return;
  }
  if (name !== undefined && (typeof name !== 'string' || name.trim() === '')) {
    res.status(400).json({ error: 'name must be a non-empty string' });
    return;
  }
  if (description !== undefined && typeof description !== 'string') {
    res.status(400).json({ error: 'description must be a string' });
    return;
  }
  const before = { name: flag.name, description: flag.description };
  const updated = await prisma.flag.update({
    where: { id: flag.id },
    data: {
      name: name === undefined ? undefined : name.trim(),
      description: description === undefined ? undefined : description.trim(),
    },
  });
  await prisma.auditLog.create({
    data: {
      projectId: flag.projectId,
      flagId: flag.id,
      ...auditEntry(req.admin!.email, 'flag.updated', before, {
        name: updated.name,
        description: updated.description,
      }),
    },
  });
  res.json({ flag: updated });
});

adminRouter.put('/projects/:slug/flags/:key/config/:env', async (req, res) => {
  const { enabled, rolloutPercentage, targetedUsers } = req.body ?? {};

  if (
    enabled !== undefined && typeof enabled !== 'boolean' ||
    rolloutPercentage !== undefined &&
      (!Number.isInteger(rolloutPercentage) || rolloutPercentage < 0 || rolloutPercentage > 100) ||
    targetedUsers !== undefined &&
      (!Array.isArray(targetedUsers) || targetedUsers.some((u) => typeof u !== 'string'))
  ) {
    res.status(400).json({
      error: 'enabled must be boolean, rolloutPercentage an integer 0–100, targetedUsers a string[]',
    });
    return;
  }

  const config = await prisma.flagConfig.findFirst({
    where: {
      flag: { key: req.params.key, project: { slug: req.params.slug } },
      environment: { name: req.params.env },
    },
    include: {
      flag: { select: { id: true, key: true, projectId: true } },
      environment: { select: { id: true, name: true } },
    },
  });
  if (!config) {
    res.status(404).json({ error: 'flag or environment not found' });
    return;
  }

  const before = {
    enabled: config.enabled,
    rolloutPercentage: config.rolloutPercentage,
    targetedUsers: config.targetedUsers,
  };
  const normalizedTargets =
    targetedUsers === undefined
      ? undefined
      : Array.from(
          new Set(
            (targetedUsers as string[]).map((u) => u.trim()).filter((u) => u !== ''),
          ),
        );

  const updated = await prisma.$transaction(async (tx) => {
    const c = await tx.flagConfig.update({
      where: { id: config.id },
      data: {
        enabled: enabled === undefined ? undefined : enabled,
        rolloutPercentage: rolloutPercentage === undefined ? undefined : rolloutPercentage,
        targetedUsers: normalizedTargets === undefined ? undefined : normalizedTargets,
      },
    });
    await tx.auditLog.create({
      data: {
        projectId: config.flag.projectId,
        flagId: config.flag.id,
        environmentId: config.environment.id,
        ...auditEntry(req.admin!.email, 'config.updated', before, {
          enabled: c.enabled,
          rolloutPercentage: c.rolloutPercentage,
          targetedUsers: c.targetedUsers,
        }),
      },
    });
    return c;
  });

  // Invalidate the cached config so SDK reads pick up the new value fast.
  await invalidateConfigKeys([cacheKey(config.environment.id, config.flag.key)]);

  res.json({
    config: {
      environment: config.environment.name,
      enabled: updated.enabled,
      rolloutPercentage: updated.rolloutPercentage,
      targetedUsers: updated.targetedUsers,
      updatedAt: updated.updatedAt,
    },
  });
});

adminRouter.delete('/projects/:slug/flags/:key', async (req, res) => {
  const flag = await prisma.flag.findFirst({
    where: { key: req.params.key, project: { slug: req.params.slug } },
    include: { configs: { include: { environment: { select: { id: true } } } } },
  });
  if (!flag) {
    res.status(404).json({ error: 'flag not found' });
    return;
  }
  const envIds = flag.configs.map((c) => c.environment.id);
  await prisma.$transaction(async (tx) => {
    await tx.auditLog.create({
      data: {
        projectId: flag.projectId,
        flagId: flag.id,
        ...auditEntry(req.admin!.email, 'flag.deleted', {
          key: flag.key,
          name: flag.name,
        }, null),
      },
    });
    // AuditLog rows for the deleted flag keep flagId=null (SetNull) so the
    // flag.deleted entry remains readable after the flag is gone.
    await tx.flag.delete({ where: { id: flag.id } });
  });
  // Invalidate cached configs for every environment of this flag.
  await invalidateConfigKeys(envIds.map((id) => cacheKey(id, flag.key)));
  res.status(204).send();
});

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------

adminRouter.get('/projects/:slug/audit', async (req, res) => {
  const project = await prisma.project.findUnique({ where: { slug: req.params.slug } });
  if (!project) {
    res.status(404).json({ error: 'project not found' });
    return;
  }
  const limitRaw = Number(req.query.limit ?? 50);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.floor(limitRaw), 1), 200) : 50;
  const entries = await prisma.auditLog.findMany({
    where: {
      projectId: project.id,
      flag: req.query.flag ? { key: String(req.query.flag) } : undefined,
      environment: req.query.environment ? { name: String(req.query.environment) } : undefined,
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      flag: { select: { key: true } },
      environment: { select: { name: true } },
    },
  });
  res.json({
    entries: entries.map((e) => ({
      id: e.id,
      actor: e.actor,
      action: e.action,
      flagKey: e.flag?.key ?? null,
      environment: e.environment?.name ?? null,
      before: e.before,
      after: e.after,
      createdAt: e.createdAt,
    })),
  });
});
