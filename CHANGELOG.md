# Changelog

All notable changes to this project are documented in this file. The format
is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.0.0] - 2026-10-31

Initial public commit.

### Added

- Express and TypeScript API with JWT admin auth and per-environment SDK
  key auth for flag evaluation.
- Projects with development, staging, and production environments,
  provisioned automatically with a fresh SDK key each.
- Flag CRUD, with one disabled config per environment created alongside
  each new flag.
- Per-environment flag configuration: enabled switch, rollout percentage
  (0-100), and targeted user list.
- Deterministic percentage rollouts using SHA-256 bucketing.
- SDK evaluation API: `GET /evaluate` and `POST /evaluate/batch`
  (at most 100 flags per batch).
- Audit log for project, flag, and config changes, with before and after
  JSON snapshots.
- Optional Redis cache for flag configs (60 second TTL, invalidated on
  write) with graceful fallback to PostgreSQL.
- Next.js 14 and Tailwind dashboard: login, flag management with toggle,
  rollout slider, and targeted user editor, and an audit log viewer.
- Prisma schema and the initial migration `0001_init`.
- Seed script creating the "Acme Demo" project, three environments, an
  admin user, and three demo flags (`new_checkout`, `dark_mode`,
  `beta_search`).
- Docker Compose setup for PostgreSQL 16, Redis 7, the API, and the
  dashboard, plus a Dockerfile for each app.
- Evaluation unit checks in `apps/api/src/test/evaluate.test.ts`
  (determinism, rollout distribution, 0% and 100% boundaries, targeting,
  and the no-user rule).

### Known limitations

- Docker images and `docker compose up` were never run in the environment
  where this was built (no Docker daemon). The migration was never applied
  to a real database there either. Both are untested until run on a machine
  with Docker and PostgreSQL.
