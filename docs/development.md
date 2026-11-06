# Development guide

## Prerequisites

- Node.js 20 or newer and npm. The `engines` field in both
  `package.json` files requires Node 20 or newer.
- PostgreSQL 16 and, optionally, Redis 7. Docker and Docker Compose are
  the easiest way to provide them.
- No Go toolchain, no Composer, and no headless browser are needed for
  this project.

## Setup

```bash
git clone https://github.com/mrpythonist/feature-flag-management.git
cd feature-flag-management
cp .env.example .env
```

Edit `.env`. At minimum set a strong `JWT_SECRET` and a real
`ADMIN_PASSWORD`. The full variable list is in the README.

Start only the database services:

```bash
docker compose up -d postgres redis
```

Redis is optional. If you skip it, leave `REDIS_URL` unset or remove the
service and the API will log a warning and run without caching.

### API

```bash
cd apps/api
npm ci
npx prisma migrate deploy
npm run seed
npm run dev
```

The API listens on http://localhost:3001. `npm run dev` uses `tsx watch`
and restarts on file changes. `npm run start` runs the compiled output
from `dist/` after `npm run build`.

### Dashboard

```bash
cd apps/web
npm ci
NEXT_PUBLIC_API_URL=http://localhost:3001 npm run dev
```

The dashboard runs on http://localhost:3000. `NEXT_PUBLIC_API_URL` must
be reachable from the browser, not just from the server.

## Seed data

`npm run seed` (`apps/api/src/seed.ts`) creates the demo project and admin
user. It is safe to run more than once: if the `acme` project already
exists it prints the current SDK keys and exits without duplicating
anything. The admin user is created if missing and left alone otherwise.

Seeded data:

- Admin user from `ADMIN_EMAIL` and `ADMIN_PASSWORD` (defaults
  `admin@example.com` and `ChangeMe123!`). Change them before any real use.
- Project "Acme Demo" with slug `acme` and three environments
  (development, staging, production), each with a fresh SDK key. The seed
  prints the keys; keep them secret.
- Flags:
  - `new_checkout` ("New Checkout Flow"): enabled in staging at 50%
    rollout, off elsewhere.
  - `dark_mode` ("Dark Mode"): enabled in production for users
    `user_123` and `user_456`, off elsewhere.
  - `beta_search` ("Beta Search"): off everywhere.

## Available commands

There is no `npm test` script and no lint script. Only run commands that
exist in the relevant `package.json`.

API (`apps/api/package.json`):

| Command | What it does |
|---|---|
| `npm run dev` | Start the API with `tsx watch` on `src/index.ts` |
| `npm run build` | Compile TypeScript to `dist/` (`tsc -p tsconfig.json`) |
| `npm run start` | Run the compiled API (`node dist/index.js`) |
| `npm run seed` | Seed the demo project, admin, and flags |
| `npm run test:evaluate` | Run the evaluation unit checks |
| `npx prisma migrate deploy` | Apply pending migrations |
| `npx prisma validate` | Validate the schema (needs `DATABASE_URL` set) |

Dashboard (`apps/web/package.json`):

| Command | What it does |
|---|---|
| `npm run dev` | Start Next.js dev server on port 3000 |
| `npm run build` | Next.js production build |
| `npm run start` | Serve the production build on port 3000 |

## Verifying a change

Run these before opening a pull request:

```bash
cd apps/api
npm run test:evaluate
npm run build
cd ../web
npm run build
```

All three must pass. The evaluation checks cover determinism, rollout
distribution over 10,000 synthetic users, 0% and 100% boundaries,
targeting, independent buckets per flag, and the no-user rule. They exit
non-zero on the first failure.

To check the schema:

```bash
cd apps/api
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/featureflags?schema=public" npx prisma validate
```

Note that `prisma validate` fails with `P1012: Environment variable not
found: DATABASE_URL` when `DATABASE_URL` is not set, even though it does
not connect to the database. Set it to any well formed PostgreSQL URL.

To check the API is up once it is running:

```bash
curl http://localhost:3001/health
```

## What cannot be verified here

The original build environment had no Docker daemon and no PostgreSQL
server. In that environment `docker compose up` and the Docker images
were never run, the migration was never applied to a real database, and
the API failed fast at startup because PostgreSQL was unreachable (which
is the intended behaviour). If you have Docker and PostgreSQL, run the
full Compose stack and the seed, and note the result in your pull
request. See `docs/screenshots/` for the terminal output captured during
verification in that limited environment.

## Project layout

```
apps/api/src/
  index.ts            # Express app, route wiring, health check
  db.ts               # Prisma client singleton
  seed.ts             # demo project, environments, admin, flags
  lib/evaluate.ts     # deterministic evaluation rules
  lib/auth.ts         # JWT signing and requireAdmin middleware
  lib/cache.ts        # optional Redis cache with graceful fallback
  lib/keys.ts         # crypto-random SDK key generation
  lib/password.ts     # bcrypt password hashing
  routes/admin.ts     # JWT-protected admin API
  routes/sdk.ts       # x-sdk-key-protected evaluation API
  test/evaluate.test.ts  # unit checks for evaluate.ts
apps/web/
  app/                # login, flags, audit pages; home redirects to /flags
  components/         # Nav, CopyButton
  lib/api.ts          # typed API client
```

## Common problems

- `JWT_SECRET is not set`: the API needs `JWT_SECRET` in the environment
  to sign tokens. Copy `.env.example` to `.env` and set it.
- `Environment variable not found: DATABASE_URL` from Prisma: set
  `DATABASE_URL` before running Prisma commands.
- API exits on startup with a PostgreSQL connection error: the database
  is not reachable. Start it with `docker compose up -d postgres` and
  check `DATABASE_URL`.
- Dashboard shows network errors: `NEXT_PUBLIC_API_URL` must be
  reachable from the browser. When the dashboard runs in a container and
  the browser is on the same machine, `http://localhost:3001` is correct.
- Login page shows the demo credentials: that is by design for the seeded
  account. Change `ADMIN_EMAIL` and `ADMIN_PASSWORD` and re-seed a fresh
  database to remove them.
