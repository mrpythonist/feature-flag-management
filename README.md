# Feature Flag and Release Management Platform

Turn features on and off per environment without redeploying code.

This is a small, self-hosted feature flag service. An Express API stores flag
configuration in PostgreSQL and evaluates flags for your applications. A
Next.js dashboard lets an admin create flags, switch them on per environment,
roll them out to a percentage of users, target specific users, and review
every change in an audit log.

## Problem it solves

Shipping a feature usually means shipping code and hoping it works for
everyone at once. Feature flags separate the deploy from the release: the
code ships dark, then you enable it for a few users, watch what happens, and
roll it out further or switch it off. This project gives a team that workflow
without paying for a hosted flag service or running a large platform.

## Key features

- Flag CRUD: create, rename, describe, and delete flags per project.
- Three environments per project (development, staging, production), each
  with its own crypto-random SDK key.
- Per-environment configuration: enabled switch, rollout percentage (0-100),
  and a targeted user list.
- Deterministic percentage rollouts using SHA-256 bucketing. The same
  flag and user always land in the same bucket, so a rollout is stable
  across requests and restarts with no sticky storage.
- Targeted users: force a flag on for specific user IDs, checked before
  the rollout rule.
- SDK evaluation API: `GET /evaluate` and `POST /evaluate/batch`,
  authenticated with an `x-sdk-key` header.
- Admin API behind JWT auth (Bearer token, 12 hour expiry).
- Audit log of every project, flag, and config change, with before and
  after JSON snapshots.
- Optional Redis cache for flag configs (60 second TTL, invalidated on
  write). The API runs without Redis and reads PostgreSQL directly.
- Dashboard: project and environment switcher with SDK key copy button,
  flag cards with toggle, rollout slider, and targeted user editor, and an
  audit log view with filters.

## Screenshots

No GUI screenshots are available yet. This repository was developed and
verified on a server without a browser, so there is no captured dashboard
image. What is captured, in `docs/screenshots/`, is real terminal output
from this environment:

- `api-tests.txt`: the evaluation unit checks passing.
- `api-build.txt`: the API TypeScript build.
- `web-build.txt`: the Next.js production build.
- `prisma-validate.txt`: Prisma schema validation.
- `api-start-attempt.txt`: the API failing fast at startup because no
  PostgreSQL server is reachable here, which is the documented behaviour.

If you run the dashboard, a screenshot of the flags page and the audit log
page would be a welcome contribution. See `CONTRIBUTING.md`.

## Architecture

```
                       +----------------+
                       |  Your apps     |  SDK clients
                       +-------+--------+
                               | x-sdk-key header
                               v
  +----------+       +----------------------------+       +--------------+
  | Next.js  |       | Express API on port 3001   |       | PostgreSQL   |
  | dashboard| ----> | /admin/*  (JWT auth)       | ----> | projects,    |
  | on :3000 |       | /evaluate (SDK auth)       |       | environments,|
  +----------+       |                            |       | flags,       |
                     | evaluate.ts: deterministic |       | configs,     |
                     | rules, in process          |       | audit logs   |
                     |                            |       +--------------+
                     | Redis cache (optional)     |       +--------------+
                     | ff:config:{env}:{flag}    | ----> | Redis :6379  |
                     | TTL 60s, deleted on write  |       | 60s TTL      |
                     +----------------------------+       +--------------+
```

Admin flow: JWT login, manage projects, flags, and configs. Writes go to
PostgreSQL, invalidate the matching Redis key, and append an AuditLog row.

SDK flow: `x-sdk-key` identifies the environment, the config is loaded from
Redis when available (cache-through) or from PostgreSQL, then
`evaluateFlag` runs in process and returns `{ enabled, reason }`.
Per-user evaluation results are deliberately not cached: caching them would
break rollout behaviour when percentages change.

See `docs/architecture.md` for the data model and the evaluation rules in
detail.

## Tech stack

| Layer | Technology |
|---|---|
| API | Node.js 20+, TypeScript, Express 4 |
| Database | PostgreSQL 16, Prisma 5 |
| Cache (optional) | Redis 7, ioredis |
| Dashboard | Next.js 14, React 18, Tailwind CSS 3 |
| Auth | JSON Web Tokens, bcryptjs password hashing |
| Tooling | Docker Compose, tsx for dev and tests |

## Prerequisites

- Node.js 20 or newer and npm.
- PostgreSQL 16 (local, or the Compose service).
- Redis 7 is optional. Without it the API logs a warning and runs uncached.
- Docker and Docker Compose if you want the container route. See the
  verification notes below before relying on it.

## Installation

### Option A: Docker Compose

```bash
git clone https://github.com/mrpythonist/feature-flag-management.git
cd feature-flag-management
cp .env.example .env
```

Edit `.env` and set a strong `JWT_SECRET` and a real `ADMIN_PASSWORD`.
Then start everything:

```bash
docker compose up --build
```

In another terminal, seed the demo project and admin user once:

```bash
docker compose run --rm api npm run seed
```

### Option B: local development

Start PostgreSQL and Redis only:

```bash
docker compose up -d postgres redis
```

API:

```bash
cd apps/api
cp ../../.env.example .env
npm ci
npx prisma migrate deploy
npm run seed
npm run dev
```

The API listens on http://localhost:3001.

Dashboard (new terminal):

```bash
cd apps/web
npm ci
NEXT_PUBLIC_API_URL=http://localhost:3001 npm run dev
```

The dashboard runs on http://localhost:3000.

## Configuration

All settings come from environment variables. Copy `.env.example` to `.env`
and edit it. There is no committed `.env` file.

| Variable | Used by | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | API | none (required) | PostgreSQL connection string |
| `REDIS_URL` | API | unset | Redis URL. Optional: if unset or unreachable the API logs a warning and runs without caching |
| `JWT_SECRET` | API | none (required) | Secret for signing admin JWTs |
| `ADMIN_EMAIL` | API seed | `admin@example.com` | Seeded admin email |
| `ADMIN_PASSWORD` | API seed | `ChangeMe123!` | Seeded admin password. Change it |
| `PORT` | API | `3001` | API listen port |
| `NEXT_PUBLIC_API_URL` | Web | `http://localhost:3001` | API base URL. Must be reachable from the browser |

## Quick start

After the seed runs, the demo project `acme` ("Acme Demo") exists with
three environments and three flags:

- `new_checkout`: enabled in staging at 50% rollout.
- `dark_mode`: enabled in production for users `user_123` and `user_456`.
- `beta_search`: off everywhere.

The seed prints the SDK key for each environment. Log in to the dashboard
at http://localhost:3000 with the admin email and password from your `.env`
file. The login page shows the default seed credentials for the demo only;
change them before any real use.

Check the API is up:

```bash
curl http://localhost:3001/health
```

## Usage and API reference

Full reference with request and response shapes: `docs/api.md`.

### Admin auth

Admin routes need `Authorization: Bearer <token>`. Get a token from the
login route (valid 12 hours):

```bash
TOKEN=$(curl -s -X POST http://localhost:3001/admin/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@example.com","password":"ChangeMe123!"}' | jq -r .token)
AUTH="Authorization: Bearer $TOKEN"
```

### Projects and environments

```bash
curl -s http://localhost:3001/admin/projects -H "$AUTH"

curl -s -X POST http://localhost:3001/admin/projects -H "$AUTH" \
  -H 'Content-Type: application/json' \
  -d '{"name":"My App","slug":"my-app"}'

curl -s http://localhost:3001/admin/projects/my-app/environments -H "$AUTH"
```

Creating a project provisions development, staging, and production
environments with a fresh SDK key each. The environments route returns the
SDK keys and is admin-only.

### Flags

```bash
curl -s -X POST http://localhost:3001/admin/projects/my-app/flags -H "$AUTH" \
  -H 'Content-Type: application/json' \
  -d '{"key":"new_checkout","name":"New Checkout","description":"Redesigned checkout"}'

curl -s http://localhost:3001/admin/projects/my-app/flags -H "$AUTH"

curl -s -X PUT http://localhost:3001/admin/projects/my-app/flags/new_checkout -H "$AUTH" \
  -H 'Content-Type: application/json' \
  -d '{"description":"Redesigned checkout, rolling out gradually"}'

curl -s -X PUT http://localhost:3001/admin/projects/my-app/flags/new_checkout/config/staging -H "$AUTH" \
  -H 'Content-Type: application/json' \
  -d '{"enabled":true,"rolloutPercentage":25,"targetedUsers":["user_123","user_456"]}'

curl -s -X DELETE http://localhost:3001/admin/projects/my-app/flags/new_checkout -H "$AUTH"
```

Creating a flag creates one disabled config per environment. Flag keys must
match `[a-z0-9_.-]` and project slugs must match `[a-z0-9-]`.

### Audit log

```bash
curl -s "http://localhost:3001/admin/projects/my-app/audit?limit=20" -H "$AUTH"
curl -s "http://localhost:3001/admin/projects/my-app/audit?flag=new_checkout&environment=staging" -H "$AUTH"
```

### SDK evaluation

SDK routes need the `x-sdk-key` header with the SDK key of the
environment you are evaluating in.

```bash
curl -s "http://localhost:3001/evaluate?flag=new_checkout&user=user_789" \
  -H "x-sdk-key: <sdk-key>"
```

Response:

```json
{"flag":"new_checkout","enabled":true,"reason":"rollout","environment":"staging"}
```

Batch evaluation (at most 100 flags per request):

```bash
curl -s -X POST http://localhost:3001/evaluate/batch \
  -H "x-sdk-key: <sdk-key>" -H 'Content-Type: application/json' \
  -d '{"flags":["new_checkout","dark_mode"],"user":"user_123"}'
```

Evaluation rules (`apps/api/src/lib/evaluate.ts`), in priority order:

1. Config disabled: `{ enabled: false, reason: "disabled" }`.
2. User in `targetedUsers`: `{ enabled: true, reason: "targeted" }`.
3. Rollout bucket: `sha256(flagKey + ":" + userId)`, first 8 hex chars as
   an integer, modulo 100, below `rolloutPercentage`:
   `{ enabled: true, reason: "rollout" }`.
4. Otherwise: `{ enabled: false, reason: "default" }`.
5. No `user` supplied: targeting and rollout are skipped,
   `{ enabled: <master switch>, reason: "no-user" }`.

Unknown flags return 404 on single evaluation and a `not-found` reason in
batch results. Treat an unknown flag as disabled (fail closed).

### SDK usage example (Node.js)

```js
const SDK_KEY = process.env.FF_SDK_KEY; // never commit this
const API = process.env.FF_API_URL ?? 'http://localhost:3001';

async function flagEnabled(flag, userId) {
  const res = await fetch(
    `${API}/evaluate?flag=${encodeURIComponent(flag)}&user=${encodeURIComponent(userId)}`,
    { headers: { 'x-sdk-key': SDK_KEY } },
  );
  if (res.status === 404) return false; // unknown flag, fail closed
  if (!res.ok) throw new Error(`flag evaluation failed: ${res.status}`);
  const { enabled } = await res.json();
  return enabled;
}

if (await flagEnabled('new_checkout', req.user.id)) {
  renderNewCheckout();
} else {
  renderOldCheckout();
}
```

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
    package.json, tsconfig.json, next.config.js, tailwind.config.js,
    postcss.config.js, Dockerfile, .dockerignore
    app/
      layout.tsx, globals.css, page.tsx  # home redirects to /flags
      login/page.tsx    # admin login
      flags/page.tsx    # flag management dashboard
      audit/page.tsx    # audit log viewer
    components/Nav.tsx, components/CopyButton.tsx
    lib/api.ts          # typed API client
  docs/
    architecture.md, development.md, api.md
    screenshots/        # real terminal output from verification runs
```

## Testing

There is no `npm test` script and no lint script. The commands that exist
are:

```bash
cd apps/api
npm run test:evaluate   # evaluation unit checks (determinism, rollout math)
npm run build           # tsc, strict TypeScript
```

The evaluation checks cover: disabled configs stay off, targeting beats
rollout, bucket determinism over 1000 repeats, about 50% rollout over
10,000 synthetic users (within 2 percentage points), 0% and 100%
boundaries, independent buckets per flag, and the no-user rule. They exit
non-zero on the first failure.

Schema check (needs `DATABASE_URL` set, even though it does not connect):

```bash
cd apps/api
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/featureflags?schema=public" npx prisma validate
```

Dashboard build:

```bash
cd apps/web
npm run build
```

## Deployment

The Compose file is the deployment route: PostgreSQL 16, Redis 7, the API,
and the dashboard. The API container runs `prisma migrate deploy` on
start, then starts the server. Set `JWT_SECRET` and `ADMIN_PASSWORD` from
real secrets in your deployment environment, never from the example values,
and put the stack behind HTTPS with a reverse proxy. There is no hosted
demo and no release packaging beyond the Dockerfiles.

## Verification notes

What was verified on this machine, and what was not:

- `npm ci` in `apps/api` and `apps/web`.
- `npx tsc --noEmit` in `apps/api` (strict TypeScript, zero errors).
- `npm run build` in `apps/api` and `npm run build` in `apps/web`
  (both succeed).
- `npm run test:evaluate`: all evaluation checks pass. One run observed
  5023 of 10,000 synthetic users enabled at a 50% rollout (50.23%).
- `npx prisma validate` on the schema: valid, with `DATABASE_URL` set.
  Without it Prisma reports `P1012: Environment variable not found:
  DATABASE_URL`.
- Not verified: `docker compose up` and the Docker images were never run
  (no Docker daemon in this environment), and the migration was never
  applied to a real database. Treat the Dockerfiles and the Compose file
  as untested until run on a machine with Docker. The API also fails fast
  at startup when PostgreSQL is unreachable, which is the intended
  behaviour; see `docs/screenshots/api-start-attempt.txt`.

## Security

- Change `JWT_SECRET`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD` from the
  defaults before any real use. The dashboard login page shows the demo
  defaults for the seeded account only.
- SDK keys authenticate read access to a single environment's flags.
  Treat them like passwords. There is no key rotation endpoint; rotate by
  deleting and re-creating the environment (flag keys stay the same).
- Unknown flags fail closed on the SDK (404, treat as disabled).
- Admin JWTs expire after 12 hours. The dashboard stores the token in
  `localStorage`.
- Request bodies are limited to 256 KB. Unknown routes return JSON 404s
  and the error handler never leaks stack traces to clients.
- CORS is wide open by default (`cors()` with no options). Restrict it to
  your dashboard origin before exposing the API publicly.
- See `SECURITY.md` for how to report a vulnerability.

## Roadmap

Ideas, in no promised order. Nothing here is committed or scheduled.

- A real test suite for the admin routes and the dashboard, plus a lint
  setup and CI.
- SDK key rotation and per-environment key management in the dashboard.
- Flag scheduling (enable or disable at a set time) and kill switches.
- User segments or percentage rollouts per segment, beyond the targeted
  user list.
- A second admin role with read-only access.
- SDK client libraries beyond the plain REST calls documented here.
- Rate limiting on the evaluation endpoints.

## Contributing

See `CONTRIBUTING.md`. Bug reports and feature requests use the templates
in `.github/ISSUE_TEMPLATE/`. Please keep changes small, keep the docs
accurate to the code, and do not add features without tests or verification
notes.

## License

MIT. See `LICENSE`.
