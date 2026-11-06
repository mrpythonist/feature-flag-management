## Summary

<!-- What does this change do, and why? Link the issue it closes, if any. -->

## Changes

<!-- List the main changes. Keep it short. -->

## Verification

<!-- What did you run, and what was the result? Paste the commands and their output. -->

- [ ] `npm run test:evaluate` in `apps/api` passes
- [ ] `npm run build` in `apps/api` passes
- [ ] `npm run build` in `apps/web` passes
- [ ] Docker Compose run (if applicable)
- [ ] Migration applied to a real database (if applicable)

Commands run:

```bash
# paste the commands you ran here
```

Results:

<!-- Paste the relevant output, or describe the result in one or two lines per command. -->

## What was not verified

<!-- Be honest. If Docker or a live database was not available, say so. -->

## Docs

- [ ] Docs updated (`README.md`, `docs/api.md`, or `docs/architecture.md`) if behaviour changed
- [ ] No new features documented that are not in the code

## Checklist

- [ ] One logical change per PR
- [ ] No secrets, `.env` files, SDK keys, JWTs, or passwords committed
- [ ] No unrelated reformatting
