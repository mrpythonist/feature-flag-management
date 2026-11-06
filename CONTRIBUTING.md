# Contributing to Feature Flag and Release Management Platform

Thanks for helping. This project is small on purpose, so keep contributions
small, focused, and verified.

## Setup

You need Node.js 20 or newer, npm, PostgreSQL 16, and optionally Redis 7.
Docker and Docker Compose are the easiest way to get the database services.

```bash
git clone https://github.com/mrpythonist/feature-flag-management.git
cd feature-flag-management
cp .env.example .env
```

Edit `.env` and set a strong `JWT_SECRET` and a real `ADMIN_PASSWORD`.
Then start PostgreSQL and Redis:

```bash
docker compose up -d postgres redis
```

API:

```bash
cd apps/api
npm ci
npx prisma migrate deploy
npm run seed
npm run dev
```

Dashboard (new terminal):

```bash
cd apps/web
npm ci
NEXT_PUBLIC_API_URL=http://localhost:3001 npm run dev
```

See `docs/development.md` for the full setup, the seed data, and how the
pieces fit together.

## Branch and commit conventions

- Work on a branch off `main`. Name it after the change, for example
  `fix/audit-filter` or `feat/sdk-key-rotation`.
- Keep one logical change per pull request. A PR that fixes a bug and
  refactors the dashboard is two PRs.
- Write commit messages in the imperative mood with a short summary line,
  for example `Fix audit filter for staging environment`. Add a body when
  the why is not obvious from the diff.
- Never commit secrets, `.env` files, SDK keys, JWTs, or passwords. The
  `.gitignore` covers `.env` files; check `git status` before committing.

## Tests

There is no `npm test` script and no lint script yet. The checks that
exist are:

```bash
cd apps/api
npm run test:evaluate   # evaluation unit checks, must pass
npm run build           # strict TypeScript build, must pass
```

For the dashboard:

```bash
cd apps/web
npm run build           # Next.js production build, must pass
```

If you change evaluation logic, extend `apps/api/src/test/evaluate.test.ts`
and keep the checks deterministic. If you add a feature, add or extend a
check for it where one can run without a live database. If your change
needs a database to verify, say so in the PR and describe what you ran.

## Pull request process

1. Open an issue first for anything larger than a typo, so the approach
   can be agreed before you write the code.
2. Fork the repo, create your branch, and make your change.
3. Run the checks above and paste the results in the PR description.
4. Update the docs when behaviour changes: `README.md`, `docs/api.md`,
   or `docs/architecture.md`, whichever fits. Do not document features
   that are not in the code.
5. Fill in the pull request template. Keep the description honest about
   what was verified and what was not. Docker and live database migration
   are not verified in every environment; say what you ran.
6. A maintainer reviews the PR. Be ready to split it up or rework it.
   Small PRs get merged faster.

## What not to do

- Do not add features that are not in the issue or the roadmap without
  discussing them first.
- Do not claim production readiness, performance numbers, or compatibility
  you have not measured.
- Do not paste real SDK keys, tokens, or credentials into issues, PRs, or
  screenshots. Use the demo values from `.env.example` only.
- Do not reformat whole files. Keep diffs reviewable.

## Code style

- TypeScript, strict mode, in the API. Keep types explicit at module
  boundaries.
- Prefer small, named functions over clever one-liners. The evaluation
  rules in `apps/api/src/lib/evaluate.ts` are the style to follow: short,
  commented, and easy to test in isolation.
- The dashboard is React with Tailwind CSS. Keep components small and
  keep API calls in `apps/web/lib/api.ts`.
