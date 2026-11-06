# Security Policy

## Supported versions

Only the `main` branch is maintained. There are no numbered releases yet.
If you run this project, run the latest commit on `main` and check for
updates before reporting an issue.

## Reporting a vulnerability

Do not open a public GitHub issue for a security vulnerability.

Report it through one of these routes:

- Open a GitHub issue in this repository marked as a security concern, with
  no exploit details in the public text, and ask the maintainer to confirm
  a private channel; or
- Use the contact route on https://mrpythonist.com.

Include:

- A description of the vulnerability and what it affects.
- Steps to reproduce, with the smallest setup that shows the problem.
- The commit you tested against.
- Whether the issue needs a live database, Redis, or Docker to reproduce.

You will get an acknowledgement, and the fix will be discussed before any
public disclosure. Please give the maintainer reasonable time to fix the
issue before disclosing it publicly.

## Known security notes

These are properties of the current code, not vulnerabilities to report
again. They are listed so users can make an informed decision.

- The default seed credentials (`admin@example.com` / `ChangeMe123!`) and
  the example `JWT_SECRET` in `.env.example` are demo values only. Change
  `JWT_SECRET`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD` before any real use.
  The dashboard login page displays the demo credentials.
- SDK keys are stored in plaintext in the database and authenticate read
  access to one environment's flags. Treat them like passwords. There is
  no key rotation endpoint; rotate by deleting and re-creating the
  environment.
- Admin JWTs are valid for 12 hours and the dashboard stores the token in
  `localStorage`.
- CORS is wide open by default (`cors()` with no options). Restrict it to
  your dashboard origin before exposing the API publicly.
- There is no rate limiting on the admin or evaluation endpoints. Put the
  API behind a reverse proxy with rate limiting if it is reachable from
  the internet.
- There is a single `admin` role. There is no read-only admin, no
  per-user permissions, and no audit of login attempts.
- Admin passwords are hashed with bcryptjs. JWTs are signed with
  `JWT_SECRET`; if that secret leaks, all admin sessions are compromised
  until it is rotated.
- Request bodies are limited to 256 KB. Unknown routes return JSON 404s
  and the error handler does not leak stack traces to clients.
