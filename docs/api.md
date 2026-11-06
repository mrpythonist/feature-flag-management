# API reference

Base URL: `http://localhost:3001` by default. All responses are JSON.
Unknown routes return `404 { "error": "not found" }`. Errors return
`{ "error": "<message>" }` and never include a stack trace. Request
bodies are limited to 256 KB.

## Authentication

### Admin routes

Every `/admin/*` route except `POST /admin/login` requires:

```
Authorization: Bearer <token>
```

Get a token from the login route. Tokens expire after 12 hours. A missing
or invalid token returns `401 { "error": "missing bearer token" }` or
`401 { "error": "invalid or expired token" }`. If `JWT_SECRET` is not set
on the server, admin routes return `500 { "error": "server misconfigured:
JWT_SECRET missing" }`.

### SDK routes

Every `/evaluate` route requires:

```
x-sdk-key: <sdk-key>
```

The key is the SDK key of one environment. It identifies the environment
and its project. A missing key returns `401 { "error": "missing x-sdk-key
header" }`. An unknown key returns `401 { "error": "invalid sdk key" }`.

## Health

### `GET /health`

No auth. Returns the server status.

Response `200`:

```json
{ "status": "ok", "time": "2026-10-31T02:21:26.000Z" }
```

## Admin auth

### `POST /admin/login`

Body:

```json
{ "email": "admin@example.com", "password": "ChangeMe123!" }
```

Response `200`:

```json
{ "token": "<jwt>", "email": "admin@example.com", "role": "admin" }
```

Wrong credentials return `401 { "error": "invalid credentials" }`.
Missing or non-string fields return
`400 { "error": "email and password are required" }`.

## Projects

### `GET /admin/projects`

Lists projects in creation order.

Response `200`:

```json
{ "projects": [{ "id": "cm...", "name": "Acme Demo", "slug": "acme", "createdAt": "2026-10-31T02:21:26.000Z" }] }
```

### `POST /admin/projects`

Creates a project and provisions development, staging, and production
environments, each with a fresh SDK key.

Body:

```json
{ "name": "My App", "slug": "my-app" }
```

- `name` must be a non-empty string.
- `slug` must match `[a-z0-9-]`.

Response `201`: `{ "project": { ...project, "environments": [...] } }`.
A duplicate slug returns `409 { "error": "a project with that slug already
exists" }`. Invalid input returns `400 { "error": "name is required and
slug must match [a-z0-9-]" }`.

An audit entry with action `project.created` is recorded.

### `GET /admin/projects/:slug/environments`

Lists the environments of a project, including SDK keys. Admin only; the
SDK routes never expose keys.

Response `200`:

```json
{ "environments": [{ "id": "cm...", "name": "staging", "sdkKey": "<48 hex chars>", "createdAt": "2026-10-31T02:21:26.000Z" }] }
```

Unknown project: `404 { "error": "project not found" }`.

## Flags

### `GET /admin/projects/:slug/flags`

Lists flags with their per-environment configs, in creation order.

Response `200`:

```json
{
  "flags": [
    {
      "id": "cm...",
      "key": "new_checkout",
      "name": "New Checkout Flow",
      "description": "Gradual rollout of the redesigned checkout experience.",
      "createdAt": "2026-10-31T02:21:26.000Z",
      "updatedAt": "2026-10-31T02:21:26.000Z",
      "configs": [
        {
          "environmentId": "cm...",
          "environment": "staging",
          "enabled": true,
          "rolloutPercentage": 50,
          "targetedUsers": [],
          "updatedAt": "2026-10-31T02:21:26.000Z"
        }
      ]
    }
  ]
}
```

Unknown project: `404 { "error": "project not found" }`.

### `POST /admin/projects/:slug/flags`

Creates a flag and one disabled config per environment.

Body:

```json
{ "key": "new_checkout", "name": "New Checkout", "description": "Redesigned checkout" }
```

- `key` must match `[a-z0-9_.-]`.
- `name` must be a non-empty string.
- `description` is optional and defaults to `""`.

Response `201`: `{ "flag": { ...flag, "configs": [...] } }`. A duplicate
key in the same project returns `409 { "error": "a flag with that key
already exists in this project" }`. Invalid input returns `400 { "error":
"key must match [a-z0-9_.-] and name is required" }`. Unknown project
returns `404 { "error": "project not found" }`.

An audit entry with action `flag.created` is recorded.

### `PUT /admin/projects/:slug/flags/:key`

Renames a flag or updates its description. Both fields are optional, but
at least the fields you send must be valid.

Body:

```json
{ "name": "New Checkout Flow", "description": "Redesigned checkout, rolling out gradually" }
```

Response `200`: `{ "flag": { ... } }`. Unknown flag returns
`404 { "error": "flag not found" }`. An empty name returns `400
{ "error": "name must be a non-empty string" }`. A non-string description
returns `400 { "error": "description must be a string" }`.

An audit entry with action `flag.updated` is recorded, with the old and
new name and description.

### `PUT /admin/projects/:slug/flags/:key/config/:env`

Updates the config of a flag in one environment. `:env` is the
environment name (`development`, `staging`, or `production`).

Body (all fields optional, only sent fields change):

```json
{ "enabled": true, "rolloutPercentage": 25, "targetedUsers": ["user_123", "user_456"] }
```

- `enabled` must be a boolean.
- `rolloutPercentage` must be an integer from 0 to 100.
- `targetedUsers` must be an array of strings. Entries are trimmed,
  empties are dropped, and duplicates are removed.

Response `200`:

```json
{
  "config": {
    "environment": "staging",
    "enabled": true,
    "rolloutPercentage": 25,
    "targetedUsers": ["user_123", "user_456"],
    "updatedAt": "2026-10-31T02:21:26.000Z"
  }
}
```

Invalid input returns `400 { "error": "enabled must be boolean,
rolloutPercentage an integer 0-100, targetedUsers a string[]" }`.
Unknown flag or environment returns
`404 { "error": "flag or environment not found" }`.

An audit entry with action `config.updated` is recorded, with the old and
new config. The matching Redis cache key is invalidated.

### `DELETE /admin/projects/:slug/flags/:key`

Deletes a flag and all its configs. Response `204` with no body. Unknown
flag returns `404 { "error": "flag not found" }`.

An audit entry with action `flag.deleted` is recorded before the delete,
and the cached configs for the flag are invalidated in every environment.

## Audit log

### `GET /admin/projects/:slug/audit`

Lists audit entries, newest first.

Query parameters:

| Parameter | Description |
|---|---|
| `limit` | Max entries, default 50, clamped to 1-200 |
| `flag` | Only entries for this flag key |
| `environment` | Only entries for this environment name |

Response `200`:

```json
{
  "entries": [
    {
      "id": "cm...",
      "actor": "admin@example.com",
      "action": "config.updated",
      "flagKey": "new_checkout",
      "environment": "staging",
      "before": { "enabled": false, "rolloutPercentage": 0, "targetedUsers": [] },
      "after": { "enabled": true, "rolloutPercentage": 25, "targetedUsers": ["user_123"] },
      "createdAt": "2026-10-31T02:21:26.000Z"
    }
  ]
}
```

`actor` is the admin email, or `"seed"` for entries created by the seed
script. `action` is one of `project.created`, `flag.created`,
`flag.updated`, `flag.deleted`, or `config.updated`. Unknown project
returns `404 { "error": "project not found" }`.

## SDK evaluation

### `GET /evaluate?flag=<key>&user=<userId>`

Evaluates one flag for one user in the environment identified by the
SDK key. `user` is optional; without it, targeting and rollout are
skipped and the master switch decides.

Response `200`:

```json
{ "flag": "new_checkout", "enabled": true, "reason": "rollout", "environment": "staging" }
```

- Missing `flag` query param: `400 { "error": "query param \"flag\" is required" }`.
- Unknown flag: `404 { "error": "flag \"new_checkout\" not found in this project" }`.

### `POST /evaluate/batch`

Evaluates several flags in one request. At most 100 flags per request.

Body:

```json
{ "flags": ["new_checkout", "dark_mode"], "user": "user_123" }
```

- `flags` must be an array of strings.
- `user` is optional and must be a string or null.

Response `200`:

```json
{
  "results": [
    { "flag": "new_checkout", "enabled": true, "reason": "rollout", "environment": "staging" },
    { "flag": "dark_mode", "enabled": true, "reason": "targeted", "environment": "staging" }
  ]
}
```

An unknown flag in a batch does not fail the request. It returns
`{ "flag": "<key>", "enabled": false, "reason": "not-found",
"environment": "<name>" }` for that flag. Treat it as disabled.

Invalid input returns `400` with one of: `"flags" must be an array of
flag keys`, `at most 100 flags per batch request`, or `"user" must be a
string or null`.

## Evaluation reasons

| Reason | Meaning |
|---|---|
| `disabled` | The flag config is switched off in this environment |
| `targeted` | The user is in `targetedUsers` |
| `rollout` | The user fell inside the rollout percentage bucket |
| `default` | Enabled, but the user is neither targeted nor in the rollout bucket |
| `no-user` | No user was supplied, so the master switch decided |
| `not-found` | Batch only: the flag does not exist in this project |

Evaluation rules in priority order: disabled, then targeted, then
rollout, then default. The rollout bucket is
`sha256(flagKey + ":" + userId)`, first 8 hex chars as an integer,
modulo 100, compared against `rolloutPercentage`. See
`docs/architecture.md` and `apps/api/src/lib/evaluate.ts`.

## Errors

| Status | When |
|---|---|
| 400 | Invalid input: bad slug, key, config values, or request shape |
| 401 | Missing or invalid Bearer token, or missing or invalid SDK key |
| 404 | Unknown project, flag, environment, or route; unknown flag on single evaluation |
| 409 | Duplicate project slug or duplicate flag key |
| 500 | Server misconfiguration (for example `JWT_SECRET` missing) or an unexpected error |
