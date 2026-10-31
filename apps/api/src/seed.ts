import { prisma } from './db';
import { newSdkKey } from './lib/keys';
import { hashPassword } from './lib/password';

/**
 * Demo seed. Idempotent-ish: if the "acme" project already exists the script
 * prints its current SDK keys and exits without duplicating anything.
 *
 * Run with: npm run seed
 */

const PROJECT_SLUG = 'acme';
const ENVIRONMENTS = ['development', 'staging', 'production'] as const;

interface SeedFlag {
  key: string;
  name: string;
  description: string;
  configs: Record<string, { enabled: boolean; rolloutPercentage: number; targetedUsers: string[] }>;
}

const FLAGS: SeedFlag[] = [
  {
    key: 'new_checkout',
    name: 'New Checkout Flow',
    description: 'Gradual rollout of the redesigned checkout experience.',
    configs: {
      development: { enabled: false, rolloutPercentage: 0, targetedUsers: [] },
      staging: { enabled: true, rolloutPercentage: 50, targetedUsers: [] },
      production: { enabled: false, rolloutPercentage: 0, targetedUsers: [] },
    },
  },
  {
    key: 'dark_mode',
    name: 'Dark Mode',
    description: 'Dark theme, targeted at the beta cohort.',
    configs: {
      development: { enabled: false, rolloutPercentage: 0, targetedUsers: [] },
      staging: { enabled: false, rolloutPercentage: 0, targetedUsers: [] },
      production: { enabled: true, rolloutPercentage: 0, targetedUsers: ['user_123', 'user_456'] },
    },
  },
  {
    key: 'beta_search',
    name: 'Beta Search',
    description: 'Experimental search ranking, currently off everywhere.',
    configs: {
      development: { enabled: false, rolloutPercentage: 0, targetedUsers: [] },
      staging: { enabled: false, rolloutPercentage: 0, targetedUsers: [] },
      production: { enabled: false, rolloutPercentage: 0, targetedUsers: [] },
    },
  },
];

async function main(): Promise<void> {
  const existing = await prisma.project.findUnique({
    where: { slug: PROJECT_SLUG },
    include: { environments: true },
  });

  const adminEmail = process.env.ADMIN_EMAIL ?? 'admin@example.com';
  const adminPassword = process.env.ADMIN_PASSWORD ?? 'ChangeMe123!';

  // Always ensure the admin user exists (create or leave alone).
  const admin = await prisma.adminUser.findUnique({ where: { email: adminEmail } });
  if (!admin) {
    await prisma.adminUser.create({
      data: { email: adminEmail, passwordHash: await hashPassword(adminPassword), role: 'admin' },
    });
    console.log(`[seed] admin user created: ${adminEmail}`);
  } else {
    console.log(`[seed] admin user already exists: ${adminEmail}`);
  }

  if (existing) {
    console.log(`[seed] project "${PROJECT_SLUG}" already exists — skipping flag seed`);
  } else {
    const project = await prisma.project.create({
      data: {
        name: 'Acme Demo',
        slug: PROJECT_SLUG,
        environments: {
          create: ENVIRONMENTS.map((name) => ({ name, sdkKey: newSdkKey() })),
        },
      },
      include: { environments: true },
    });

    for (const def of FLAGS) {
      const flag = await prisma.flag.create({
        data: {
          projectId: project.id,
          key: def.key,
          name: def.name,
          description: def.description,
        },
      });
      for (const env of project.environments) {
        const cfg = def.configs[env.name] ?? { enabled: false, rolloutPercentage: 0, targetedUsers: [] };
        await prisma.flagConfig.create({
          data: {
            flagId: flag.id,
            environmentId: env.id,
            enabled: cfg.enabled,
            rolloutPercentage: cfg.rolloutPercentage,
            targetedUsers: cfg.targetedUsers,
          },
        });
      }
      await prisma.auditLog.create({
        data: {
          projectId: project.id,
          flagId: flag.id,
          actor: 'seed',
          action: 'flag.created',
          before: undefined,
          after: { key: def.key, name: def.name },
        },
      });
      console.log(`[seed] flag created: ${def.key}`);
    }
    console.log(`[seed] project "${PROJECT_SLUG}" created`);
  }

  const project = await prisma.project.findUniqueOrThrow({
    where: { slug: PROJECT_SLUG },
    include: { environments: true },
  });

  console.log('\n=== SDK keys (keep secret; SDK callers authenticate with these) ===');
  for (const env of project.environments) {
    console.log(`${env.name}: ${env.sdkKey}`);
  }
  console.log('\n=== Admin login ===');
  console.log(`POST http://localhost:${process.env.PORT ?? 3001}/admin/login`);
  console.log(`email: ${adminEmail}`);
  console.log('password: the ADMIN_PASSWORD env var (or the default from .env.example — change it!)');
}

main()
  .catch((err) => {
    console.error('[seed] failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
