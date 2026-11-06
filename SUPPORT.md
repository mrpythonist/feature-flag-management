# Support

## Documentation

Start with the README. It covers installation, configuration, the API, and
the verification notes. The `docs/` folder has more detail:

- `docs/architecture.md`: data model, evaluation rules, and request flows.
- `docs/development.md`: local setup, seed data, and how to verify changes.
- `docs/api.md`: full API reference with request and response shapes.

## Asking a question

Open a GitHub issue in this repository and use the feature request template
for questions that are really feature ideas. For a setup problem, include:

- The commit you are running (`git rev-parse --short HEAD`).
- Your Node.js version (`node --version`).
- Whether you are running with Docker Compose or locally.
- The exact command you ran and the full error output.

Do not paste real SDK keys, JWTs, passwords, or production connection
strings into an issue. Use the demo values from `.env.example` only.

## Bug reports

Use the bug report template in `.github/ISSUE_TEMPLATE/bug_report.yml`.
Include the steps to reproduce, what you expected, and what happened
instead. If the bug needs a database to reproduce, say so.

## Security issues

Do not open a public issue for a vulnerability. See `SECURITY.md`.

## Response time

This is a personal open source project maintained alongside other work.
Issues and pull requests are reviewed when time allows. Small, well
described issues with reproduction steps get attention first.
