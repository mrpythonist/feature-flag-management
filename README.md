# Feature Flag & Release Management Platform

A lightweight LaunchDarkly-inspired platform for managing feature flags across
development, staging, and production — without redeploying code. Developers get
a REST API to evaluate flags for their users; teams get a dashboard to toggle
flags, roll out to a percentage of users, target specific users, and review
every configuration change in an audit log.

**Stack:** Node.js 20 + TypeScript, Express, PostgreSQL (Prisma), Redis
(optional, graceful fallback), Next.js 14 + Tailwind dashboard, Docker Compose.

## Features

- Create feature flags with a key, name, and description
- Enable / disable flags per environment
- Three environments per project (development, staging, production), each with
  its own crypto-random SDK key
- Deterministic percentage-based rollouts (SHA-256 bucketing — stable across
  restarts, no sticky storage needed)
- Targeted users: force-enable a flag for specific user IDs
- SDK REST API (`GET /evaluate`, `POST /evaluate/batch`) authenticated with
  `x-sdk-key` per environment
- Admin REST API behind JWT auth (Bearer token)
- Audit log of every flag/config change with before/after JSON snapshots
- Redis cache for flag configs (60s TTL, invalidated on write); the API runs
  fine without Redis — it logs a warning and reads PostgreSQL directly
- Dashboard: project/environment switcher with SDK-key copy button, flag
  cards with toggle / rollout slider / targeted-users editor, audit log table
  with filters and expandable before/after diffs

## Architecture

```
                    ┌────────────────┐
                    │   Your apps    │  SDK clients
                    └───────┬────────┘
                            │ x-sdk-key header
                            ▼
 ┌──────────┐   ┌────────────────────────────┐   ┌──────────────┐
 │ Next.js  │   │        Express API :3001   │   │  PostgreSQL  │
 │ dashboard│──▶│  /admin/* (JWT auth)       ├──▶│  (Prisma)    │
 │ :3000    │   │  /evaluate (SDK auth)      │   │  projects,   │
 └──────────┘   │                            │   │  envs, flags,│
                │  ┌───────────────────────┐ │   │  configs,    │
                │  │ evaluate.ts           │ │   │  audit logs  │
                │  │ deterministic rules   │ │   └──────────────┘
                │  └───────────────────────┘ │
                │  ┌───────────────────────┐ │   ┌──────────────┐
                │  │ Redis cache (optional)│──▶│    Redis :6379 │
                │  │ ff:config:{env}:{key} │   │  60s TTL       │
                │  │ TTL 60s, del on write │   └──────────────┘
                │  └───────────────────────┘ │
                └────────────────────────────┘

Admin flow:  JWT login -> manage projects/flags/configs -> writes hit
PostgreSQL, invalidate the Redis key, and append an AuditLog row.

SDK flow:    x-sdk-key -> env -> config (Redis, cache-through, or Postgres) ->
evaluateFlag(key, userId) in-process -> { enabled, reason }.
Per-user evaluation results are deliberately NOT cached: caching them would
break rollout semantics when percentages change.
```

## Quickstart

### With Docker Compose (recommended)

```bash
cp .env.example .env
# Edit .env: set a strong JWT_SECRET and change ADMIN_PASSWORD.
docker compose up --build
# In another terminal, seed the demo project + admin user once:
docker compose run --rm api npm run seed
```

- API: http://localhost:3001 (`/health` to check)
- Dashboard: http://localhost:3000 — log in with the admin credentials
- Seed creates project "Acme Demo" (`acme`) with 3 environments and prints
  their SDK keys, plus flags `new_checkout`, `dark_mode`, `beta_search`

### Local development

```bash
# Start PostgreSQL + Redis only:
docker compose up -d postgres redis

# API:
cd apps/api
cp ../../.env.example .env   # or set DATABASE_URL / JWT_SECRET manually
npm ci
npx prisma migrate deploy
npm run seed                 # creates admin + demo data, prints SDK keys
npm run dev                  # http://localhost:3001

# Dashboard (new terminal):
cd apps/web
npm ci
NEXT_PUBLIC_API_URL=http://localhost:3001 npm run dev   # http://localhost:3000
```

### Seed credentials

- Admin email/password come from `ADMIN_EMAIL` / `ADMIN_PASSWORD`
  (defaults: `admin@example.com` / `ChangeMe123!`). **Change them before any
  real use** — the seed script reminds you on every run.

## API reference

Admin routes require `Authorization: Bearer <token>`. SDK routes require the
`x-sdk-key` header (the environment's SDK key, visible to admins at
`GET /admin/projects/:slug/environments`).

### Admin auth

```bash
TOKEN=$(curl -s -X POST http://localhost:3001/admin/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@example.com","password":"ChangeMe123!"}' | jq -r .token)
AUTH="Authorization: Bearer $TOKEN"
```

### Projects & environments

```bash
# List projects
curl -s http://localhost:3001/admin/projects -H "$AUTH"

# Create a project (provisions development/staging/production + SDK keys)
curl -s -X POST http://localhost:3001/admin/projects -H "$AUTH" \
  -H 'Content-Type: application/json' \
  -d '{"name":"My App","slug":"my-app"}'

# List environments (includes SDK keys — admin only)
curl -s http://localhost:3001/admin/projects/my-app/environments -H "$AUTH"
```

### Flags

```bash
# Create a flag (creates one disabled config per environment)
curl -s -X POST http://localhost:3001/admin/projects/my-app/flags -H "$AUTH" \
  -H 'Content-Type: application/json' \
  -d '{"key":"new_checkout","name":"New Checkout","description":"Redesigned checkout"}'

# List flags with per-environment configs
curl -s http://localhost:3001/admin/projects/my-app/flags -H "$AUTH"

# Rename / describe
curl -s -X PUT http://localhost:3001/admin/projects/my-app/flags/new_checkout -H "$AUTH" \
  -H 'Content-Type: application/json' \
  -d '{"description":"Redesigned checkout, rolling out gradually"}'

# Configure an environment: enable, 25% rollout, target two users
curl -s -X PUT http://localhost:3001/admin/projects/my-app/flags/new_checkout/config/staging -H "$AUTH" \
  -H 'Content-Type: application/json' \
  -d '{"enabled":true,"rolloutPercentage":25,"targetedUsers":["user_123","user_456"]}'

# Delete
curl -s -X DELETE http://localhost:3001/admin/projects/my-app/flags/new_checkout -H "$AUTH"
```

### Audit log

```bash
curl -s "http://localhost:3001/admin/projects/my-app/audit?limit=20" -H "$AUTH"
curl -s "http://localhost:3001/admin/projects/my-app/audit?flag=new_checkout&environment=staging" -H "$AUTH"
```

### SDK evaluation

```bash
SDK="x-sdk-key: <sdk-key-from-seed-or-environments-endpoint>"

# Single flag for a user
curl -s "http://localhost:3001/evaluate?flag=new_checkout&user=user_789" -H "$SDK"
# -> {"flag":"new_checkout","enabled":true,"reason":"rollout","environment":"staging"}

# Batch
curl -s -X POST http://localhost:3001/evaluate/batch -H "$SDK" \
  -H 'Content-Type: application/json' \
  -d '{"flags":["new_checkout","dark_mode"],"user":"user_123"}'
```

Evaluation rules (`apps/api/src/lib/evaluate.ts`), in priority order:

1. Config disabled → `{ enabled: false, reason: "disabled" }`
2. User in `targetedUsers` → `{ enabled: true, reason: "targeted" }`
3. `rolloutPercentage > 0` and `sha256(flagKey + ":" + userId)` (first 8 hex
   chars as int) `% 100 < rolloutPercentage` → `{ enabled: true, reason: "rollout" }`
4. Otherwise → `{ enabled: false, reason: "default" }`
5. No `user` supplied → skip rules 2–3, `{ enabled: <master switch>, reason: "no-user" }`

## SDK usage example (Node.js)

```js
// Evaluate a flag for the current user. Use the SDK key of the environment
// your app is running in (e.g. from an env var at deploy time).
const SDK_KEY = process.env.FF_SDK_KEY; // never commit this
const API = process.env.FF_API_URL ?? 'http://localhost:3001';

async function flagEnabled(flag, userId) {
  const res = await fetch(
    `${API}/evaluate?flag=${encodeURIComponent(flag)}&user=${encodeURIComponent(userId)}`,
    { headers: { 'x-sdk-key': SDK_KEY } },
  );
  if (res.status === 404) return false; // unknown flag -> fail closed
  if (!res.ok) throw new Error(`flag evaluation failed: ${res.status}`);
  const { enabled } = await res.json();
  return enabled;
}

// In a route/handler:
if (await flagEnabled('new_checkout', req.user.id)) {
  renderNewCheckout();
} else {
  renderOldCheckout();
}

// Or fetch several flags in one round trip:
const res = await fetch(`${API}/evaluate/batch`, {
  method: 'POST',
  headers: { 'x-sdk-key': SDK_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({ flags: ['new_checkout', 'dark_mode'], user: req.user.id }),
});
const { results } = await res.json(); // [{ flag, enabled, reason, environment }]
```

## Environment variables

| Variable | Used by | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | api | — (required) | PostgreSQL connection string |
| `REDIS_URL` | api | unset | Redis URL. Optional: if unset or unreachable the API logs a warning and runs without caching |
| `JWT_SECRET` | api | — (required) | Secret for signing admin JWTs |
| `ADMIN_EMAIL` | api (seed) | `admin@example.com` | Seeded admin email |
| `ADMIN_PASSWORD` | api (seed) | `ChangeMe123!` | Seeded admin password — change it |
| `PORT` | api | `3001` | API listen port |
| `NEXT_PUBLIC_API_URL` | web | `http://localhost:3001` | API base URL, must be reachable from the browser |

## Resume bullets

Copy-ready, truthful:

- Built a LaunchDarkly-inspired feature flag platform: REST API design
  (Express + TypeScript), multi-environment configuration (dev/staging/prod),
  and a Next.js + Tailwind admin dashboard
- Implemented deterministic percentage rollouts via SHA-256 bucketing and
  targeted user overrides; evaluation rules unit-tested for determinism and
  distribution
- Added Redis caching for flag configs (60s TTL, invalidated on write) with
  graceful fallback to PostgreSQL when Redis is unavailable
- Secured admin routes with JWT authentication and SDK routes with per-
  environment SDK keys; audit-logged every configuration change with
  before/after snapshots
- Containerized with Docker Compose (PostgreSQL 16, Redis 7, API, dashboard)
  and modeled data with Prisma, including a hand-written initial migration

## Verification notes

What was verified in this environment, and what was not:

- ✅ `npm ci` in `apps/api` and `apps/web`
- ✅ `npx tsc --noEmit` in `apps/api` (strict TypeScript, zero errors)
- ✅ `npx prisma validate` on the Prisma schema
- ✅ `npm run build` in `apps/web` (Next.js production build succeeds)
- ✅ `npm run test:evaluate`: the evaluation unit checks pass — determinism
  (same flag+user → same bucket), ~50% observed rollout over 10k synthetic
  users (within ±2pp), 0%/100% boundaries, flag-independent buckets, and
  targeting/no-user rules
- ❌ Not verified: Docker images / `docker compose up` were **never run**
  (no Docker daemon in this environment), and the migration was **never
  applied to a real database**. Treat the Dockerfiles and compose file as
  untested until run on a machine with Docker.

## Project structure

```
feature-flag-management/
  README.md
  docker-compose.yml
  .env.example
  .gitignore
  apps/api/
    package.json, tsconfig.json, Dockerfile, .dockerignore
    prisma/schema.prisma
    prisma/migrations/0001_init/migration.sql
    src/
      index.ts            # Express app, route wiring, health check
      db.ts               # Prisma client singleton
      seed.ts             # demo project, envs, admin, flags (idempotent-ish)
      lib/evaluate.ts     # deterministic evaluation rules
      lib/auth.ts         # JWT signing + requireAdmin middleware
      lib/cache.ts        # optional Redis cache with graceful fallback
      lib/keys.ts         # crypto-random SDK key generation
      lib/password.ts     # bcrypt password hashing
      routes/admin.ts     # JWT-protected admin API
      routes/sdk.ts       # x-sdk-key-protected evaluation API
      test/evaluate.test.ts  # unit checks for evaluate.ts
  apps/web/
    package.json, tsconfig.json, next.config.js, tailwind.config.js,
    postcss.config.js, Dockerfile, .dockerignore
    app/
      layout.tsx, globals.css, page.tsx  # redirects to /flags
      login/page.tsx    # admin login
      flags/page.tsx    # flag management dashboard
      audit/page.tsx    # audit log viewer
    components/Nav.tsx, components/CopyButton.tsx
    lib/api.ts          # typed API client
```

## Security notes

- Change `JWT_SECRET`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD` from the defaults
  before any real use. The dashboard shows the defaults on the login page for
  the demo seed only.
- SDK keys authenticate read access to a single environment's flags; treat
  them like passwords. Rotate by deleting and re-creating the environment
  (flag keys stay the same).
- Unknown flags fail closed on the SDK (`404` → treat as disabled).
