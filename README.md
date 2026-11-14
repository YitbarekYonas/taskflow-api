# TaskFlow

![Node](https://img.shields.io/badge/node-%E2%89%A520-339933)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6)
![License](https://img.shields.io/badge/license-MIT-blue)

A team task-management API built with Node.js, Express, TypeScript, and Prisma.

## Features
- **CLI:** Add, list, start, complete, delete, filter, and export tasks (CSV).
- **HTTP API:** Full CRUD for tasks, projects, and comments, with SQL-powered pagination, sorting, searching, and filtering.
- **Auth & Access Control:** User registration, login (JWT), refresh tokens (rotation + reuse detection), logout, role-based access control, and **rate limiting** (counters shared across instances via Redis).
- **Core:** Repository pattern, Unit of Work for transactions, Zod validation, strict TypeScript, and centralized error handling.
- **Database:** PostgreSQL with Prisma ORM, enforcing referential integrity, cascading deletes, and composite indexes for fast queries.
- **Testing:** Vitest unit tests for pure logic, integration tests against a real, isolated test database via Supertest, and a small post-build smoke test of the compiled server. Coverage thresholds ratchet both suites.
- **Code quality:** ESLint (flat config, type-aware rules, architecture enforcement), Prettier, Husky pre-commit/pre-push hooks, Redocly OpenAPI linting, and `npm run ci` for the exact pipeline CI will run.
- **Observability:** Structured JSON logging with pino, request-scoped correlation via `AsyncLocalStorage`, secret redaction by field name, and a Prisma-safe error serializer. `/ready` reports dependency state (database required, Redis optional-but-visible).
- **Production Middleware:** Security headers (Helmet), CORS, Request IDs, body size limits, and **rate limits**.
- **Infrastructure:** PostgreSQL and Redis run via `docker compose`, both bound to `127.0.0.1` (not every interface). Redis holds shared rate-limit counters; if it is down, the limiters fall back to per-instance in-memory counters and `/ready` reports `degraded`.

## Setup

### Prerequisites
- Node.js 20+
- Docker (for PostgreSQL **and** Redis)

### Install
```bash
git clone https://github.com/YitbarekYonas/taskflow-api.git
cd taskflow-api
cp .env.example .env
npm install
npm run setup
```

`npm install` installs the Git hooks via `prepare: "husky || true"`. If you're in an environment without Git (CI runner, fresh container), set `HUSKY=0` before `npm install` to skip the hook installation.

### Verify
```bash
npm run typecheck
```

## Development
```bash
npm run dev     # Run API with auto-restart (http://localhost:3000), pretty logs via pino-pretty
npm run dev:json # Same, but raw JSON on stdout (no pretty pipe)
npm run cli -- list  # Run CLI
npm run build   # Build for production
npm start       # Run compiled JS
```

`npm run db:up` starts **PostgreSQL and Redis** in one command (`docker compose up -d`), both bound to `127.0.0.1` so they are not reachable from the network. `npm run db:down` stops both.

## Database & Infrastructure Workflow

| Task | Command |
|---|---|
| Start PostgreSQL and Redis | `npm run db:up` |
| Stop both | `npm run db:down` |
| Apply migrations and create new ones (dev) | `npm run db:migrate` |
| Apply migrations only (CI, production) | `npm run db:deploy` |
| Rebuild the dev database with sample data | `npm run db:fresh` |
| Add sample data (safe to repeat) | `npm run db:seed` |
| Verify migrations from scratch | `npm run db:check-migrations` |

**Development Seed Credentials:** `sam@example.com` / `dev-password-123` (only available in development, never in production).

**Redis (development):** an unauthenticated instance on `127.0.0.1:6379`, `appendonly yes`, `maxmemory 256mb`, `maxmemory-policy noeviction` (Day 38 adds BullMQ jobs here; nothing may be silently evicted). `REDIS_URL` in `.env` points at it.

## Development Workflow

| Command | What it does |
|---|---|
| `npm run precheck` | Typecheck, lint, format check, OpenAPI lint, unit tests, build (~30s) |
| `npm run ci` | `precheck` plus integration tests (~1 min) — what CI will run |
| `npm run lint` / `npm run lint:fix` | ESLint with `--max-warnings 0`; fix mode applies autofixes |
| `npm run format` / `npm run format:check` | Prettier write / check |
| `npm run lint:openapi` | Export the spec to `.tmp/openapi.json` and run Redocly against it |
| `npm run verify` | Build and run everything against the compiled server |
| `npm run test:coverage` | Combined unit + integration with ratcheted thresholds |

**Git hooks (installed by `npm install`):**
- **`pre-commit`** runs `lint-staged` on staged files (`eslint --fix --max-warnings 0` + `prettier --write` for `.ts`; `prettier --write` for `.json`, `.yml`, `.yaml`, `.mjs`). Takes ~2 seconds because it only touches staged files.
- **`pre-push`** runs `npm run typecheck:all` + `npm run test:unit`. Takes ~10 seconds. Integration tests are left to `npm run ci` because they need a database and take 25 seconds.

Hooks can be skipped with `git commit --no-verify` / `git push --no-verify`, so **only CI is a real gate.** The `pre-push` hook is a courtesy for keeping broken code off the remote branch, not a security boundary.

### Editor setup

`.vscode/extensions.json` recommends **ESLint**, **Prettier**, and **EditorConfig**. `.vscode/settings.json` enables format-on-save (Prettier) and ESLint autofix-on-save. Every editor reads `.editorconfig` (utf-8, LF, 2 spaces, final newline). The point is team consistency — no "I use 2-space, you use 4" arguments.

### Architecture enforcement

`eslint.config.mjs` uses `no-restricted-imports` to make the composition-root rule **executable**:
- `src/controllers/**`, `src/routes/**`, `src/services/**`, `src/auth/**`, `src/middleware/**`, `src/schemas/**` — **cannot** import Prisma or `src/repositories/prisma/**`.
- `src/container.ts`, `src/server.ts`, `src/cli.ts` — allowed (composition roots and shutdown).

A new developer who tries `import { prisma } from "../db.js"` in a controller gets a clear error pointing to `src/container.ts`, and the pre-commit hook blocks the commit. It's not a convention — it's a failing check.

## Documentation & Testing

Interactive API docs are available at `http://localhost:3000/docs` when the server is running. You can test every endpoint directly in the browser.

See [docs/TESTING.md](./docs/TESTING.md) for the full testing guide: the three layers (unit / integration / smoke), commands, conventions and known gaps.

```bash
npm test                  # unit, then integration
npm run test:coverage     # both suites, with thresholds
npm run verify            # build + all tests + smoke against the compiled server
```

To verify the whole project against a **compiled** server (what actually ships), run:
```bash
npm run verify
```
This builds `dist/`, starts it, then runs `test:unit`, `test:integration`, and `smoke` in that order. The script ends with `Everything passed.` when all three steps succeed.

![Smoke Test Results](./docs/smoke-test.png)

### Unit Tests (no database, no server)
```bash
npm run test:unit       # Fast unit tests (about a second)
npm run test:watch      # Re-run affected tests on every save
```

Unit tests cover pure logic that needs no I/O:
- Pagination metadata (`buildMeta`)
- Slugs (`slugify`, `makeSlug` with controlled randomness)
- Access rules (`requireProjectRole`, `taskRole`, `requireTaskRole`)
- Passwords (`hashPassword`, `verifyPassword`)
- Refresh-token helpers (generation, hashing, family ids)
- Access tokens (sign/verify, expiry, and forged/tampered/`alg:none` rejection)
- Config validation (including production guards)
- Error-to-status mapping (with order locked in)
- Date helpers (`isPastDate`, `todayUtc` with an injected clock)
- Zod schemas (ids, NUL characters, mass-assignment, query params)
- **Logger format, level filtering, redaction (7 paths), Prisma error serialization, non-Error thrown values, request context propagation across `await`/timers/overlapping requests, `setContextUser`, explicit-field-wins-vs-mixin** (`logger.test.ts`, 21 tests)
- **Readiness logic** (`tests/unit/health.test.ts`): `ok` / `degraded` / `unavailable` table, `disabled` for no Redis, and a hanging dependency treated as `down` within `timeoutMs`
- **ResilientStore fallback** (`tests/unit/middleware/resilientStore.test.ts`): primary used when healthy, fallback on error (with the operation name passed to `onFallback`), automatic return to the primary on the next call, `decrement`/`resetKey` covered, `init` forwarded to both

The tests are named after behavior, and the tables in `it.each` make gaps obvious. Coverage is used as a map of untested logic, not a score — controllers, repositories, and routes are covered by integration tests, not unit tests.

### Integration Tests (real PostgreSQL and Redis, no server)
```bash
npm run test:integration   # API tests against a real, isolated test database
npm test                   # unit tests, then integration tests
```

Integration tests run the real HTTP stack — validation, controllers, services, Prisma, and PostgreSQL — against a **separate** database (`taskflow_test` by default). They use **Supertest**, which calls `createApp()` directly; no `npm run dev`, no port conflicts. The rate-limiter tests additionally run against **Redis database 15**, which `assertTestRedis` enforces.

- **Prerequisites:** PostgreSQL **and** Redis must be running (`npm run db:up`).
- **The test database is created and migrated automatically** on the first run (`prisma migrate deploy`).
- **Wiped before every test** (`TRUNCATE ... RESTART IDENTITY CASCADE`), so tests are independent and IDs are predictable.
- **Two layers of protection** against wiping the wrong database:
  1. `globalSetup.ts` refuses any URL whose database name doesn't match `/^[a-z0-9_]+_test$/`.
  2. `truncateAll()` runs `SELECT current_database()` and refuses if the name doesn't end in `_test`.
- **Two layers of protection** against wiping the wrong Redis database:
  1. `assertTestRedis()` refuses any URL whose pathname isn't `/15`.
  2. `flushTestRedis()` runs `assertTestRedis()` again before `flushdb()`.
- **Files run one at a time** (`fileParallelism: false`) because they share one database.

Integration tests cover seven areas:

**Auth**
- Registration: 201 with public fields, Argon2id hash stored, no password in body, security headers, duplicate email 409 (case-insensitive), mass-assignment rejected, malformed JSON/array/`null`/`text/plain` rejected, **8 parallel registrations produce exactly one account**.
- Login: access + refresh tokens issued, refresh hash stored (not the token), two families per user, identical 401 for unknown email vs. wrong password, unusable hash → 401, no session created on failure, validation errors on missing/extra fields.
- `/auth/me`: valid token returns the user, no/garbage/wrong-scheme/empty token 401, valid token for a deleted user 401.
- **Sessions:** rotation, reuse detection (whole family revoked), logout, logout-all, purge of expired rows, **exactly one of six parallel refreshes succeeds** (5 rounds), and a documented test for the known limitation that an access token issued before logout stays valid until it expires.

**Tasks**
- CRUD: create personal or project tasks with defaults and `createdById` from the token, `Location` header, all validation errors returning 400 and storing nothing.
- Visibility: project members see shared tasks, strangers see `404` identical to missing tasks, personal tasks visible only to their creator, `meta.total` counts only visible tasks.
- PATCH: any member can edit any field of a teammate's task, strangers get `404` and the row is unchanged, moving `projectId` requires being the creator or the project owner, target project must be visible.
- Delete: creator or project owner only, comments cascade with the task.
- Filtering: `status`, `priority`, `search` (case-insensitive), and combinations.
- Sorting: `createdAt`, `title`, `priority`, `dueDate`, with `id` as tie-breaker, and `nulls: "last"` honored in both `asc` and `desc`.
- Pagination: page/limit table with correct `meta`, and **"walk every page"** — 25 tasks with heavy `priority` ties split across 3 pages, all 25 distinct, rank order never goes back up (Day 18's bug class, made permanent).
- Due dates: a past date on creation returns `400 "Due date cannot be in the past."`; updates may still set past dates; the CLI (`SYSTEM` actor) is exempt.

**Projects**
- Create: `201` with slug, `Location`, creator's `owner` membership created; validation table (empty name, client-chosen slug/`createdById`, NUL) → 400.
- List/get: only your projects, `taskCount` accurate, stranger `404` == missing `404`.
- Update/delete: owner renames/deletes; member `403`, stranger `404`; delete blocked with `409` while tasks exist.
- Duplicate: copies project + tasks as `todo` tasks with `createdById: caller`, `Location` header, original untouched, custom name accepted.
- Merge: tasks move, source disappears, memberships cascade, **all-or-nothing** on unowned target (source and target both unchanged), self-merge 400, member on source 403, stranger 404, and **two simultaneous merges → exactly one `200`, the loser is `404` or `409`, no task lost or duplicated**.

**Members & Comments & the access matrix**
- **Members:** owner adds by email (case-insensitive, immediate access), can add as `owner`; 409 for an existing member (role unchanged), 404 for unknown email; promote/demote validation, **last-owner cannot demote or leave** (`409`), removing a member leaves their tasks in the project but strips their access at once. Includes a **10-round race** where two owners demote each other simultaneously — never zero owners, never both succeed.
- **Comments:** author comes from the token (client-supplied `author`/`authorId`/`taskId` rejected), the author edits their own words, **even a project owner cannot edit another user's comment** (403, unchanged), the author or project owner deletes, a stranger gets `404`, comments vanish with their task, **a comment cannot be reached through the wrong task's URL** (IDOR), and on a deleted account the comment keeps its `author` name but loses `authorId` and can only be moderated.
- **Access matrix:** 24 actions × 3 personas (stranger/member/owner) = **72 cells**, each asserting the exact status and — for every denied request — that a **fingerprint of every table is unchanged before and after**. The matrix is the executable version of the roles table below; a missing cell is visible, a wrong cell fails a test with a readable name.

**Logging & observability**
- **One structured line per request**, with `event: "http.request"` and a `requestId` matching the `X-Request-Id` response header.
- **Level mapping**: 200 → `info`, 4xx → `warn`, 5xx → `error`.
- **Path only, never the query string** — a request with `?search=needle-in-the-query` produces a log line whose `path` field is `/tasks`, and the needle string appears nowhere in the output.
- **`userId` only on authenticated requests.**
- **The `auth.refresh_reuse` event written inside `auth.service.ts`** (no explicit `requestId` argument) **carries the request id** of the HTTP request being served — proving the `AsyncLocalStorage` context survives the body parser and reaches code deep inside a service.
- **Six parallel replays keep their request ids distinct** — no cross-contamination under load.
- **The leak test** pushes real passwords (correct, wrong, and short), the access token, the refresh token (original and rotated), and the user's email through `register` / `login` / `me` / `refresh` / `logout` — **none of them appear anywhere in the log output**. `$argon2` also absent.
- **Unexpected 500s** log the real cause at `error` level with the request id, while the client sees a generic message. A fake Prisma error with an email and a password hash in its message produces no `LEAK` in the output but keeps the final "Unique constraint failed" reason.

**Readiness** (`tests/integration/health.test.ts`)
- `/health` answers `200` without touching any dependency (liveness only).
- `/ready` answers `ok` when the database works and Redis is not configured (`redis: "disabled"`).
- `/ready` answers `503` when the database is down (`status: "unavailable"`).
- `/ready` answers `200` when only Redis is down (`status: "degraded"`).

**Rate-limit stores** (`tests/integration/rateLimitStores.test.ts`)
- Against real Redis: counts hits and reports `resetTime`, the window starts on the first hit and is **not extended** by later hits, a fresh window starts after expiry (this closes the Day 35 window-expiry gap), 50 concurrent increments produce exactly `1..50` with no lost step, every key always has a positive `PTTL`, `decrement` on a missing key does not create it, `resetKey` forgets a counter, and different prefixes stay independent.

**Rate limiters** (`ratelimit.test.ts`) — runs **twice**, once with `MemoryStore` and once with the Redis store (`describe.each(["memory", "redis"])`)
- Builds its own copy of the app with `RATE_LIMIT_ENABLED=true` via `vi.stubEnv` + `vi.resetModules()` + dynamic import. The redis variant additionally sets `REDIS_URL=TEST_REDIS_URL`, calls `connectRedis()`, and `flushTestRedis()`s database 15 before the suite.
- Each test uses its own `X-Forwarded-For` address so limiters don't interfere.
- Covers: register (5/hour per IP), login per account (10/15min, case-insensitive emails, "correct password while throttled"), login per IP (30/15min, successful logins don't count), refresh/logout (60/15min shared), invites (20/hour per user), global (300/min per IP, `/health` and `/ready` exempt).
- **Redis specifics** (only run for the redis variant): `rl:register:<ip>` exists with value `"1"` and a positive `PTTL` after one request (proves the store is actually in use, not a silent fallback), and **no email address appears in any `rl:*` key** (the per-account limiter hashes the email).
- The limiter body is no longer a coverage gap: `rateLimit.ts` and `limiters.ts` are now covered by both variants.

**Outage behavior** (`ratelimit.outage.test.ts`)
- With `REDIS_URL` pointing at a port that nothing listens on: the app still starts (degraded), the register limiter still returns `400 × 5, 429` from the in-memory fallback, every response completes in well under 2 s (`enableOfflineQueue: false` + `commandTimeout: 500`), and `/ready` answers `200` with `{ status: "degraded", checks: { database: "up", redis: "down" } }`.

**Docs & auth coverage & operation ids** (`docs.and.auth.test.ts`)
- Every documented operation answers `401` without credentials (except `GET /health`, `GET /ready`, `POST /auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout`).
- Every protected operation documents a `401` response in the spec.
- `/openapi.json` serves, its `openapi: "3.1.0"` and `info.version` matches `package.json`.
- `/docs/` serves.
- `bearerAuth` is declared.
- **`operationId` exists on every operation.**
- **`operationId` values are unique.**

- **Test infrastructure:** DB name ends in `_test` (both safety layers), all migrations applied, tables empty between tests, `RESTART IDENTITY` gives `id=1`, Redis URL is database `/15`.
- **Security & docs:** Helmet headers present, CORS allows `Authorization` for the configured origin, unknown routes return JSON `404`, oversized bodies return `413` with the standard error shape.

### Coverage (unit + integration together)
```bash
npm run test:coverage   # Runs both suites once and enforces thresholds
```

The combined run prints a per-file coverage report and writes HTML to `coverage/`. **Thresholds are a ratchet:** they live in `vitest.coverage.config.ts` and only go up. A failing threshold means "add tests", never "lower the number". If a threshold fails, the command exits non-zero — this is what the Week 7 CI gate will check.

Current thresholds (measured after Day 35, rounded down − 2 to absorb v8's rounding noise):
- Statements: **90**
- Branches: **78**
- Functions: **96**
- Lines: **92**

Expected low-coverage files that are **not** regressions:
- `src/repositories/prisma/*.repository.ts` — the `P2002`/`P2003`/`P2025` mappings that the service layer's fast-path checks prevent from being hit. The `task.repository.ts` P2003 path is covered by a dedicated repo-level test; the rest are documented as gaps.

### Post-build smoke test
```bash
npm run smoke       # 13 checks against the COMPILED server
```

`smoke.ts` builds the project, starts `dist/server.js`, and hits it over real HTTP. It's the only test that proves the *built artifact* works — no missing file in `dist/`, no broken import path after compilation, no missing runtime dependency. It now also checks `GET /ready` after `GET /health`, so the compiled server is proven to expose the readiness endpoint. Detailed behavior is `npm test`'s job; the smoke test is intentionally small.

### Test Scripts
| Script | What it proves |
|---|---|
| `npm run test:unit` | Pure functions (pagination, slugs, access rules, tokens, config, schemas, dates, logger, readiness, resilient store) |
| `npm run test:watch` | Re-runs affected tests on save |
| `npm run test:integration` | API tests against a real, isolated test database (`taskflow_test`) and Redis database 15 |
| `npm test` | Unit tests, then integration tests |
| `npm run test:coverage` | Runs both suites once with coverage report and thresholds |
| `npm run smoke` | Post-build check of the compiled server over real HTTP |
| `npm run lint:openapi` | Redocly lint of the exported OpenAPI spec |
| `npm run verify` | Builds, starts the compiled server, then runs all of the above |

## Business Rules

- A task's `dueDate` cannot be in the past **on creation** through the API. The rule uses the **UTC calendar date**.
- Updates may still set a past date (people correct dates after the fact).
- The CLI (`SYSTEM` actor) is exempt — imports and data fixes are unaffected.

## Logging

Output is **one JSON object per line on stdout**. The platform (Docker, systemd, cloud) collects and rotates; the app does not.

**Fields:**

| Field | Present on | Meaning |
|---|---|---|
| `level` | every line | Numeric: 10 trace, 20 debug, 30 info, 40 warn, 50 error, 60 fatal |
| `time` | every line | ISO 8601 timestamp |
| `service` | every line | Always `"taskflow"` |
| `msg` | every line | Short, constant, human-readable |
| `event` | business events | Stable name, e.g. `http.request`, `auth.refresh_reuse`, `redis.ready`, `redis.error`, `redis.unavailable`, `rate_limit.store_fallback` |
| `requestId` | inside a request's async context | Matches the `X-Request-Id` response header |
| `userId` | authenticated requests | The user making the request |
| `method`, `path`, `status`, `durationMs`, `ip` | `event: "http.request"` | Standard request fields |
| `limiter`, `operation` | `event: "rate_limit.store_fallback"` | Which limiter fell back to memory, and which store operation failed |

**Reading them:**

```bash
npm run dev                  # pretty output for development
npm run dev:json             # raw JSON lines
npm run dev:json | jq 'select(.status >= 400)'                   # only failures
npm run dev:json | jq 'select(.event == "auth.refresh_reuse")'   # security events
npm run dev:json | jq 'select(.event == "rate_limit.store_fallback")'  # limiter degraded
```

If a user reports a bug, find their `X-Request-Id` in the response header and grep the logs for `"requestId":"<that id>"` — every line written while serving that request will match.

**Security:** secrets are redacted by field name (`password`, `passwordHash`, `accessToken`, `refreshToken`, `authorization`, `cookie`, `jwtSecret`, `databaseUrl` at three depths). Query strings, request bodies and email addresses are never logged. Prisma errors are trimmed to their final line and `meta` is dropped. **A test sends real passwords, hashes, tokens and an email through the API and fails if any appear in the output.** Redis rate-limit keys contain a **hashed** email, not the raw address.

**Known limits of redaction:** it works by key name only. A secret inside a message string, under an unlisted key (`pwd`, `rawToken`), or nested deeper than the configured paths is not redacted. Defense #1 is **not putting the secret in the log call**; the leak test is the second line.

**Operation IDs in the OpenAPI spec** are auto-generated from method + path (`op.operationId ??= operationIdFor(method, path)` inside `withSecurity()`) so they are unique by construction and stable across runs. A hand-written `operationId` is preserved; a missing one gets generated. `npm run lint:openapi` runs Redocly against the exported spec, and a unit test asserts existence and uniqueness — because a linter only catches what someone remembers to run, and a test catches every push.

**Redis log throttling:** `redis.error` is logged at most once per 30 s (ioredis emits an `error` on every failed retry; without the throttle an outage would flood stdout). `rate_limit.store_fallback` is logged at most once per 30 s **per limiter** (an outage would otherwise produce one warning per request per limiter).

## Security

See [SECURITY.md](./SECURITY.md) for reporting vulnerabilities and the full list of known limitations.

See [docs/THREAT_MODEL.md](./docs/THREAT_MODEL.md) for the threat model and what is not defended today.

## API Endpoints

**System** (public)
| Method | Path | Description | Success |
|--------|------|-------------|---------|
| GET | `/health` | Liveness: the process is alive. Touches no dependency. | 200 |
| GET | `/ready` | Readiness: the database is reachable (`503` if not), Redis is optional (`200` with `degraded` if Redis is down, `disabled` if not configured). | 200 / 503 |

**Auth** (public)
| Method | Path | Description | Success |
|--------|------|-------------|---------|
| POST | `/auth/register` | Create an account (Argon2id hashed) | 201 |
| POST | `/auth/login` | Log in and receive access + refresh tokens | 200 |
| POST | `/auth/refresh` | Exchange a refresh token for a new pair | 200 |
| POST | `/auth/logout` | Revoke the refresh token's family | 204 |
| GET | `/auth/me` | Get the logged-in user (requires token) | 200 |
| POST | `/auth/logout-all` | Log out every session (requires token) | 204 |

**Tasks** (login required)
| Method | Path | Description | Success |
|--------|------|-------------|---------|
| GET | `/tasks` | List tasks you can see (see params below) | 200 |
| GET | `/tasks/:id` | Get one task (requires membership) | 200 |
| POST | `/tasks` | Create a task (past `dueDate` rejected with 400) | 201 |
| PATCH | `/tasks/:id` | Update fields (creator, owner, or member) | 200 |
| DELETE | `/tasks/:id` | Delete a task (creator or project owner only) | 204 |

**Projects** (login required)
| Method | Path | Description | Success |
|--------|------|-------------|---------|
| GET | `/projects` | List projects you belong to | 200 |
| GET | `/projects/:id` | Get one project (requires membership) | 200 |
| POST | `/projects` | Create a project | 201 |
| PATCH | `/projects/:id` | Update a project (owner only) | 200 |
| DELETE | `/projects/:id` | Delete a project (owner only, fails with 409 if it has tasks) | 204 |
| GET | `/projects/:id/tasks` | List the tasks of one project (requires membership) | 200 |
| POST | `/projects/:id/duplicate` | Duplicate a project (requires membership) | 201 |
| POST | `/projects/:id/merge` | Merge this project (owner only) | 200 |

**Project Members**
| Method | Path | Description | Success |
|--------|------|-------------|---------|
| GET | `/projects/:id/members` | List the members of a project (requires membership) | 200 |
| POST | `/projects/:id/members` | Add a member by email (owner only) | 201 |
| PATCH | `/projects/:id/members/:userId` | Change a member's role (owner only) | 200 |
| DELETE | `/projects/:id/members/:userId` | Remove a member (owner only) or leave yourself (member) | 204 |

**Comments** (login required)
| Method | Path | Description | Success |
|--------|------|-------------|---------|
| GET | `/tasks/:taskId/comments` | List comments for a task | 200 |
| POST | `/tasks/:taskId/comments` | Create a comment (author from token) | 201 |
| GET | `/tasks/:taskId/comments/:commentId` | Get one comment | 200 |
| PATCH | `/tasks/:taskId/comments/:commentId` | Update a comment (author only) | 200 |
| DELETE | `/tasks/:taskId/comments/:commentId` | Delete a comment (author or owner) | 204 |

### `GET /tasks` Query Parameters
| Param | Values | Default |
|-------|--------|---------|
| `status` | `todo`, `in_progress`, `done` | all |
| `priority` | `low`, `medium`, `high` | all |
| `projectId` | integer (e.g., `1`) | all |
| `search` | text in title | none |
| `sort` | `createdAt`, `dueDate`, `priority`, `title` | `createdAt` |
| `order` | `asc`, `desc` | `asc` |
| `page` / `limit` | integers (limit max 100) | `1` / `10` |

### Sample Response (`GET /tasks`)
```json
{
  "data": [
    { "id": 1, "title": "Write report", "status": "done", "priority": "high", "projectId": 1 }
  ],
  "meta": { "page": 1, "limit": 10, "total": 13, "totalPages": 2, "hasNext": true, "hasPrev": false }
}
```

### Sample Response (`GET /ready`)
```json
{
  "status": "ok",
  "checks": { "database": "up", "redis": "up" }
}
```
`status` is `ok`, `degraded` (Redis down or disabled, database up), or `unavailable` (database down, response is `503`). `checks.redis` can be `up`, `down`, or `disabled` (no `REDIS_URL`).

### Error Response
```json
{
  "error": { "message": "Validation failed", "details": [{ "path": "title", "message": "Required" }] }
}
```
*Status codes: 400 (Bad Input), 401 (Unauthorized), 403 (Forbidden), 404 (Not Found), 409 (Conflict), 413 (Payload Too Large), 429 (Too Many Requests), 500 (Server Error), 503 (Not Ready)*

### Rate Limiting
Rate limits are applied to protect sensitive endpoints. **Counters live in Redis and are shared between server instances; a restart does not reset the budget.** If Redis is unreachable, each instance falls back to in-memory counters, so limits are still applied (weaker: `N` instances give `N ×` the budget) and `/ready` reports `degraded`.

- `POST /auth/register`: 5 per hour per IP
- `POST /auth/login`: 30 per 15 min per IP and 10 per 15 min per account (only failures count)
- `POST /auth/refresh` / `/logout`: 60 per 15 min per IP
- `POST /projects/:id/members`: 20 per hour per user
- All routes: 300 per minute per IP
- `GET /health` and `GET /ready`: **exempt** from the global limiter (load balancers and orchestrators poll them every few seconds)

A `429 Too Many Requests` response includes `Retry-After` and `RateLimit` headers. The error body includes `retryAfterSeconds`. The per-account key contains a **hashed** email address, so Redis operators cannot enumerate login targets via `KEYS` or `MONITOR`.

**Mount discipline:** each limiter is attached **once**, either in `app.ts` (only `globalLimiter`) or on the route handlers (the auth limiters in `auth.routes.ts`, `inviteLimiter` in `projects.routes.ts`). Mounting the same limiter in both places runs it twice per request and halves its effective limit — this exact bug was fixed on Day 32 (see Known Limitations #25). Any new limiter must follow the same rule: **one mount, one place** — `grep -rn "Limiter" src/` is the fast check. Every limiter also carries a unique `name` (used as the Redis key prefix `rl:<name>:`) — two limiters sharing a name would share a counter, and the redis variant of `ratelimit.test.ts` is the test that catches it.

## Authentication & Authorization

### Login & Tokens
Log in to receive a **short-lived access token** (15 min) and a **refresh token** (30 days):

```bash
curl -s -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"sam@example.com","password":"dev-password-123"}'
```

Use the access token in the `Authorization: Bearer <token>` header:

```bash
curl http://localhost:3000/tasks \
  -H "Authorization: Bearer <your-token-here>"
```

### Roles & Access Control

| | Stranger | Member | Owner |
|---|---|---|---|
| See project, tasks, comments | `404` | yes | yes |
| Create tasks and comments | `404` | yes | yes |
| Edit any task | `404` | yes | yes |
| Delete a task | `404` | own only | any |
| Edit a comment | `404` | own only | own only |
| Delete a comment | `404` | own only | any |
| Rename/delete/merge/manage members | `404` | `403` | yes |
| Leave the project | `404` | yes | if not last owner |

**Rule:** Strangers get `404` (so they can't tell if a project exists). A member without rights gets `403`. Roles are looked up on every request. The table is **executable** — `tests/integration/access.matrix.test.ts` runs all 24 actions against all three personas (72 cells) and, for every denied request, asserts that a fingerprint of every table is identical before and after.

### Refresh Tokens
Access tokens expire after 15 minutes. Use the refresh token to get a new pair:

```bash
curl -s -X POST http://localhost:3000/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"<your-refresh-token>"}'
```

**Important:**
- Each refresh token can be used **only once**.
- A new refresh token is returned on every refresh (rotation).
- If an already-used token is presented, the **entire family** is revoked (reuse detection).

### Logout
```bash
curl -X POST http://localhost:3000/auth/logout \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"<your-refresh-token>"}'
```

**Note:** Logout revokes the refresh token, but an access token that was already issued stays valid until it expires (15 min). This is a documented limitation and a test in `auth.sessions.test.ts` locks it in.

### Sessions Diagram

```mermaid
sequenceDiagram
  participant C as Client
  participant A as API
  C->>A: POST /auth/login
  A-->>C: access (15 min) + refresh R1
  C->>A: GET /tasks (Bearer access)
  A-->>C: 200
  Note over C,A: access token expires
  C->>A: POST /auth/refresh (R1)
  A-->>C: new access + refresh R2 (R1 is now used)
  C->>A: POST /auth/refresh (R1 again)
  A-->>C: 401, whole family revoked
```

*Note: The `/auth/login` and `/auth/register` endpoints never reveal whether an email exists.*

## Architecture

```
HTTP request
  → helmet → cors → requestId → logger → rate limiter → json parser
  → requestContext (AsyncLocalStorage)  ← runs AFTER the body parser
  → route (validate params / query / body)
  → controller (HTTP in, HTTP out)
  → service (business rules, logs with requestId from context)
  → UnitOfWork (transactions) → repository (SQL queries via Prisma)
```

`/health` and `/ready` are registered directly in `app.ts` (not in a router) because they must work even when the route layer is misbehaving, and because they are the only two endpoints exempt from the global limiter. `defaultReadiness` lives in `app.ts` and calls `prisma.$queryRaw\`SELECT 1\`` and `redis.ping()` behind a `Promise.race` timeout, so a hanging dependency is reported as `down` instead of hanging the probe. `createApp({ readiness })` accepts an injected probe — that is how `tests/integration/health.test.ts` exercises the `503` and `degraded` branches without a real outage.

The repository pattern decouples business logic from data storage. Services depend on a `Repository<T>` interface, not a specific implementation. Listing, filtering, sorting, and pagination are handled directly by PostgreSQL. Multi-step operations (like `duplicate` and `merge`) run through a `UnitOfWork`. Role checks happen in the service layer, using a dedicated `Access` helper. Rate limiting runs before body parsing to avoid resource exhaustion.

`requestContext` sits **after** the body parser deliberately: `express.json()` calls `next()` from a stream event, and a listener runs in the context of whoever calls `emit` — so a context store created before the parser would be lost for POST requests. Running it after means every downstream handler — including code inside a service that never received a `requestId` argument — logs with the correct request's id.

The layering above is **enforced by ESLint**, not just documented. `no-restricted-imports` blocks `src/controllers/**`, `src/routes/**`, `src/services/**`, `src/auth/**`, `src/middleware/**`, and `src/schemas/**` from importing Prisma or `src/repositories/prisma/**`. Only `src/container.ts`, `src/server.ts`, and `src/cli.ts` may — the composition root, the shutdown hook, and the CLI.

## Performance

Moving list queries from JavaScript to SQL drastically reduced response times, especially when handling large datasets. Here are the benchmarks on a seeded database of **50,000 tasks**:

| Query Case | Before (In-Memory) | After (SQL + Indexes) |
|------------|--------------------|-----------------------|
| First page | 180 ms | 6 ms |
| Status + Priority | 220 ms | 4 ms |
| Search | 195 ms | 4 ms |
| Deep page (4999) | 210 ms | 5 ms |

*(Run `npm run db:bench-seed` to seed data, and `npm run bench` to run the benchmark).*

## Configuration
| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | The port the Express server listens on | `3000` |
| `NODE_ENV` | Environment mode | `development` |
| `DATABASE_URL` | PostgreSQL connection string | (required) |
| `TEST_DATABASE_URL` | PostgreSQL connection string for integration tests (must end in `_test`) | `postgresql://postgres:postgres@localhost:5432/taskflow_test` |
| `CORS_ORIGIN` | Allowed origins for browser requests | `http://localhost:5173` |
| `LOG_LEVEL` | Logging verbosity: `trace`, `debug`, `info`, `warn`, `error`, `fatal`, `silent` | `info` |
| `JWT_SECRET` | Secret used to sign access tokens (min 32 chars) | (required) |
| `ACCESS_TOKEN_TTL_SECONDS` | Access token lifetime in seconds | `900` (15 min) |
| `REFRESH_TOKEN_TTL_DAYS` | Refresh token lifetime in days | `30` |
| `RATE_LIMIT_ENABLED` | Enable rate limiting (must be `true` in production) | `false` (dev) |
| `TRUST_PROXY_HOPS` | Number of reverse proxies in front of the app | `0` |
| `DOCS_ENABLED` | Serve Swagger docs at `/docs` | `true` |
| `REDIS_URL` | Redis connection string for shared rate-limit counters. Empty means in-memory (per-process) counters. | `redis://localhost:6379` (dev); **required in production** |

## Database & Redis

```mermaid
erDiagram
  USER ||--o{ PROJECT_MEMBER : "belongs via"
  PROJECT ||--o{ PROJECT_MEMBER : "has (cascade)"
  PROJECT ||--o{ TASK : "contains (restrict)"
  USER ||--o{ TASK : "assigned (set null)"
  USER ||--o{ TASK : "created (set null)"
  USER ||--o{ PROJECT : "created (set null)"
  TASK ||--o{ COMMENT : "has (cascade)"
  USER ||--o{ COMMENT : "wrote (set null)"
  USER ||--o{ REFRESH_TOKEN : "owns (cascade)"

  USER {
    int id PK
    string email UK
    string name
    string password_hash
  }
  PROJECT {
    int id PK
    string name
    string slug UK
    int created_by_id FK
  }
  PROJECT_MEMBER {
    int project_id PK
    int user_id PK
    string role
  }
  TASK {
    int id PK
    string title
    string status
    string priority
    date due_date
    int project_id FK
    int assignee_id FK
    int created_by_id FK
  }
  COMMENT {
    int id PK
    int task_id FK
    int author_id FK
    string author
    string content
  }
  REFRESH_TOKEN {
    int id PK
    int user_id FK
    string token_hash UK
    string family_id
    datetime expires_at
    datetime used_at
    datetime revoked_at
  }
```

**Redis layout (development):** single instance, `appendonly yes`, `maxmemory 256mb`, `maxmemory-policy noeviction`, bound to `127.0.0.1:6379`. Rate-limit keys are `rl:<limiter-name>:<key>`, where `<key>` is `ip:<subnet>` (IPv6 normalized to a `/56` by `ipKeyGenerator`), `email:<32-hex>` (SHA-256, truncated), or `user:<id>`. Every key has a `PEXPIRE ... NX`-set TTL, so nothing lives forever. Database **15** is reserved for the test suite; `assertTestRedis` refuses any other.

## Production Middleware

- **Helmet:** Sets security-related HTTP headers (e.g., `X-Content-Type-Options`, `Content-Security-Policy`).
- **CORS:** Restricts browser requests to allowed origins (`CORS_ORIGIN` in `.env`).
- **Request IDs:** Each request gets an `X-Request-Id` header, echoed back and included in logs for tracing.
- **Body Limit:** JSON payloads are capped at 100kb to prevent abuse (returns `413 Payload Too Large`).
- **Rate Limiter:** Throttles brute-force and enumeration attacks. Returns `429` with `Retry-After` and `RateLimit` headers. Counters live in Redis and are shared across instances; if Redis is down, each instance falls back to in-memory counters and `/ready` reports `degraded`.
- **Readiness (`/ready`):** Reports `status` (`ok`, `degraded`, `unavailable`) and `checks.database` / `checks.redis` (`up`, `down`, `disabled`). `503` only when the database is down. Exempt from the global rate limiter.
- **Logger:** Pino — one JSON object per line on stdout, with `requestId` and `userId` from the `AsyncLocalStorage` context on every line. Secrets redacted by field name; query strings and bodies never logged; Prisma errors trimmed to their final line.

## Project Structure
```
prisma/
├── schema.prisma         # Database schema
├── seed.ts               # Development seed data
└── migrations/           # SQL migration history

docs/
├── TESTING.md            # Testing layers, commands, conventions, known gaps
├── THREAT_MODEL.md       # Threat model and what is not defended
└── smoke-test.png        # Smoke test screenshot

tests/
├── unit/                 # Vitest unit tests (mirrors src/)
├── integration/          # Supertest tests against a real test database + Redis db 15
└── support/              # Shared helpers: env, app, auth, factories, scenarios, sessions, truncate, globalSetup, redis

src/
├── app.ts, server.ts, cli.ts
├── auth/                 # Password hashing, JWT utilities, refresh token helpers, policy (Actor), access (roles)
├── container.ts          # Composition root
├── db.ts                 # Prisma Client instance
├── redis.ts              # ioredis client: lazy connect, fail-fast, throttled error log, connectRedis/closeRedis
├── health.ts             # checkReadiness: parallel probes with a deadline
├── requestContext.ts     # AsyncLocalStorage store + setContextUser
├── config.ts, logger.ts, errors.ts, types.ts, utils.ts
├── docs/                 # OpenAPI spec
├── generated/prisma/     # Auto-generated Prisma Client (gitignored)
├── schemas/              # Zod validation
├── services/             # Business logic: tasks, projects, comments, auth, dates
├── middleware/           # Logger, request context, validation, error handling, request IDs, authenticate, rate limiters, rateLimitStores
├── controllers/          # HTTP logic
└── routes/               # Express routes
```

## Tech Stack
Node.js, TypeScript, Express 5, PostgreSQL, Prisma, Redis (ioredis), Zod, dotenv, tsx, Helmet, CORS, Swagger UI, Argon2, jose, express-rate-limit, pino, pino-pretty, Vitest, Supertest, ESLint (flat config, typescript-eslint), Prettier, Husky, lint-staged, Redocly.

## Roadmap
- [x] Week 1 — CLI core
- [x] Week 2 — Express API (CRUD, pagination, filtering, repository pattern, projects, comments, production middleware, OpenAPI docs)
- [x] Week 3 — PostgreSQL & Prisma (Schema, Migrations, ORM integration, Constraints, SQL Pagination, Transactions, Seeding)
- [x] Week 4 — Auth (JWT)
- [x] User registration with Argon2id
- [x] Login and access tokens
- [x] Refresh tokens and logout
- [x] Roles and project membership
- [x] Rate limiting and security hardening
- [x] Week 4 wrap-up and v0.4.0
- [x] Week 5 — Testing, code quality and observability
  - [x] Vitest setup and unit tests for pure logic
  - [x] Test database + Supertest integration tests for auth
  - [x] Integration tests for tasks and projects (incl. filtering, sorting, pagination, duplicate, merge)
  - [x] Due-date business rule (past dates rejected on creation, CLI exempt) with unit-tested boundary
  - [x] Integration tests for members, comments, sessions, access matrix and docs
  - [x] Combined coverage run with ratcheted thresholds (90/78/96/92)
  - [x] Retired six hand-written scripts (token-attacks, auth-coverage, refresh-flow, access-attacks, security-checks, test-ratelimit), shrunk smoke to a post-build check
  - [x] ESLint (flat config, type-aware rules), Prettier, Husky pre-commit/pre-push hooks, `precheck` and `ci` scripts
  - [x] Structured logging with pino + `AsyncLocalStorage` + redaction, and Redocly OpenAPI linting
  - [x] Documentation drift tests and Week 5 wrap-up and v0.5.0
- [ ] Week 6 — Real-world features (Redis, jobs, email, uploads, real-time)
  - [x] Redis in Docker Compose; shared rate-limit counters via `RedisCounterStore` + `ResilientStore`; `GET /ready`; graceful Redis shutdown
  - [ ] Cache-aside dashboard stats (Day 37)
  - [ ] Background jobs with BullMQ (Day 38)
  - [ ] Email verification + password reset (Day 39)
  - [ ] File attachments with MinIO (Day 40)
  - [ ] Real-time notifications with WebSockets (Day 41)
  - [ ] Week 6 wrap-up and v0.6.0 (Day 42)
- [ ] Week 7 — Docker, CI and deployment

## Known Limitations
1. **In-memory rate limits (fixed on Day 36):** Counters now live in Redis and are shared across instances; the budget survives a restart. If `REDIS_URL` is empty, the app falls back to per-instance `MemoryStore` (dev only; the production config refuses to start without `REDIS_URL`).
2. **During a Redis outage, rate limits degrade to per-instance:** `ResilientStore` falls back to `MemoryStore`, so an attacker facing `N` instances gets `N ×` the budget until Redis recovers. `/ready` reports `degraded` so operators see the outage; `rate_limit.store_fallback` is logged (once per 30 s per limiter). The alternative — fail closed — would 503 every login during the outage; fail open would remove the limit entirely.
3. **Fixed-window rate limiting allows a burst at the window boundary:** A client can make `limit` requests at the end of one window and `limit` at the start of the next, getting `2 × limit` in a short span. A sliding-window implementation (sorted set + Lua script) is a challenge.
4. **`ipKeyGenerator` normalizes IPv6 to a `/56` subnet:** Two clients in the same block share a budget. This is the intended defense against rotating through addresses, but one abusive client in a shared `/56` can rate-limit neighbors.
5. **No Redis authentication or TLS in development:** The `docker-compose.yml` instance is unauthenticated and unencrypted, bound to `127.0.0.1` (not reachable from the network). A shared or remote Redis must run with `requirepass` and TLS; `REDIS_URL` supports `redis://:password@host:port`, but the config does not enforce it.
6. **`/ready` is public and reveals dependency state:** It returns `checks.database` and `checks.redis` to anyone who asks. Acceptable for an internal service behind a load balancer, but on a public API it should be restricted to the infrastructure (header check, or a private port). The field shape is intentionally minimal (no versions, no hostnames, no credentials).
7. **Redis is a single instance with `noeviction` and `appendonly yes`:** If memory fills, writes fail (correct for the Day 38 queue, wrong for a cache). A real system would run separate instances for cache and queues, or a cluster.
8. **The in-memory fallback's counters are local to the process and reset on restart:** During a Redis outage, if the app is also restarted, per-instance counters start at zero again. The same limitation as pre-Day-36 rate limits, scoped to outages.
9. **Per-account throttle:** An attacker can intentionally lock a victim out by flooding `/auth/login` with wrong passwords.
10. **No CAPTCHA or MFA:** A determined attacker with a botnet can still try many passwords.
11. **No email verification:** Accounts can be created with fake emails. Week 6 adds verification and password reset.
12. **Access tokens cannot be revoked:** A stolen access token stays valid for up to 15 minutes after logout. `auth.sessions.test.ts` locks this in as a characterization test.
13. **Member invites reveal email existence:** Adding a member by email returns 404 if the user doesn't exist. Rate limiting makes probing slow, but not impossible.
14. **No automated alerting:** Repeated `auth 401` events are logged but not flagged.
15. **Search Wildcards:** Searching for `%` or `_` returns all tasks because SQL `LIKE` interprets them as wildcards.
16. **No Retries on `P2034`:** We haven't implemented automatic retries for deadlocks yet.
17. **No CI:** We don't have a GitHub Actions pipeline yet. This will be added in Week 7.
18. **Offset pagination is slow on deep pages:** `OFFSET 49980` still walks past 49,980 rows. Week 5 fixes this.
19. **`ILIKE` search lacks a trigram index:** The search is slow on large tables. Week 5 fixes this.
20. **CSV export loads all rows:** The export uses `findAll()`, which loads the entire table into memory. Week 5 fixes this.
21. **`/health` doesn't check the database:** It's liveness only, by design. **`/ready` (Day 36) is the readiness probe** that checks the database and reports Redis.
22. **No grace window for concurrent refreshes:** Two parallel legitimate refreshes will kill the family and force a login.
23. **Rotation isn't wrapped in one transaction:** If the new token fails to save after the old one is used, the user must log in again.
24. **No device list or session names:** Users can't see "logged in from iPhone" and revoke individual sessions.
25. **Only two roles (owner, member):** No read-only "viewer" role yet.
26. **Legacy tasks and projects with no owner are invisible:** Only the CLI can see/modify them.
27. **`listComments` still loads every comment before filtering:** It uses `findAll()` instead of a `WHERE taskId = ?` query. Week 5 fixes this.
28. **Unit tests don't cover HTTP or SQL:** Controllers, repositories, and routes show 0% unit coverage by design. Integration tests (Week 5, Days 30–32) cover them.
29. **Integration tests run serially:** The test database is shared across files, so `fileParallelism: false` is required. Per-worker databases would allow parallelism at the cost of setup complexity.
30. **Test database is wiped on every `beforeEach`:** Correct for the current suite (a few ms per wipe), but slower than transaction rollback isolation.
31. **Rate-limit tests build their own app copy:** `tests/integration/ratelimit.test.ts` uses `vi.stubEnv` + `vi.resetModules()` + dynamic import to build a fresh app with `RATE_LIMIT_ENABLED=true`. The shared test app still runs with limits off, so ordinary tests can send as many requests as they like. **Window expiry is now tested** against real Redis in `rateLimitStores.test.ts` (short `windowMs` + `sleep`).
32. **Rate limiters must be mounted exactly once:** A limiter attached both in `app.ts` by path **and** on the route handler runs twice per request and halves its effective limit. This bug existed for `registerLimiter`, `loginIpLimiter`, and `refreshLimiter` and was fixed on Day 32. Any new limiter must follow the same rule: **one mount, one place** — `grep -rn "Limiter" src/` is the fast check.
33. **Every limiter needs a unique `name`:** The Redis key is `rl:<name>:<key>`, so two limiters sharing a name share a counter. Mutation row 2 of the Day 36 table (giving `refresh` the name `register`) is caught **only** by the redis variant of `ratelimit.test.ts` — the memory variant cannot see the collision because its `MemoryStore` is per-limiter. This is why the suite runs both.
34. **Due-date rule uses the UTC calendar date, not the caller's local date:** A user far west of UTC can be rejected for setting "today" in their time zone late in their evening. Options (accept vs. one-day grace vs. `Time-Zone` header) are documented in `notes.md`; the current choice is to accept UTC for consistency with the rest of the API.
35. **Integration tests don't cover every branch of `PATCH /tasks/:id`:** Coverage gaps identified in my own test list: preserving `createdById` through a patch is only implicitly covered, and "stranger moves `projectId`" isn't a distinct test. Not bugs — candidates for a second pass.
36. **Six scripts retired in Week 5:** `scripts/token-attacks.ts`, `scripts/auth-coverage.ts`, `scripts/refresh-flow.ts`, `scripts/access-attacks.ts`, `scripts/security-checks.ts` (retired Day 32), and `scripts/test-ratelimit.ts` (retired Day 35). Each replacement is a named integration suite, and the mutation tables are the evidence that the suites catch the bugs the scripts caught.
37. **`smoke.ts` is intentionally small (13 checks):** It's a post-build check of the *compiled* `dist/` server, not a behavior suite. It now also checks `GET /ready`. Detailed behavior is `npm test`'s job.
38. **`typescript-eslint` needs TypeScript 6, not 7:** The project uses the native TypeScript 7 compiler (`tsc`), but `typescript-eslint` requires the TypeScript 6 JS compiler API. `package.json` uses the official side-by-side alias.
39. **`eslint-config-prettier` is the only rule-disabling plugin:** Every ESLint rule disabled in `eslint.config.mjs` has a written reason. `errorHandler.ts` has one file-level `eslint-disable` for `no-unsafe-member-access`/`no-unsafe-assignment`, with a written reason.
40. **`no-restricted-imports` is the architecture fitness function:** It makes `src/container.ts` the only place that constructs concrete repositories; controllers, routes, services, auth, middleware, and schemas cannot import `../db.js` or `src/repositories/prisma/**`. Verified by a temporary Prisma import in a controller (rejected) and in `server.ts`/`cli.ts` (allowed), then reverted. **`src/app.ts` is also allowed** — it wires the readiness probe.
41. **`precheck` / `ci` catch drift the individual scripts can miss:** The first `npm run ci` found 7 files that had drifted from Prettier's output. `format:check` is the canary — cheap, and it never lies.
42. **Hooks are not the gate:** Only `npm run ci` on a fresh checkout is a real gate. Week 7's pipeline will run `npm run ci` and will not rely on hooks.
43. **`prepare: "husky || true"`:** Husky's install is guarded so `npm ci --omit=dev` in a production Docker build doesn't crash when Husky (a devDependency) isn't installed.
44. **Redaction is by key name only:** A secret inside a message string, a field name not in `SENSITIVE_KEYS`, or nesting deeper than the 3 configured paths is **not** redacted. The integration leak test is the real defense.
45. **Prisma's own query log bypasses pino:** With `LOG_LEVEL=debug` on the Prisma client, SQL is written by Prisma in its own format. Routing Prisma's `query` events through `pino` is a documented challenge.
46. **No log shipping or alerting yet:** The app writes JSON to stdout; a real system would pipe to a log aggregator and alert on `auth.refresh_reuse` frequency, 5xx rate, and rate-limit hits. Documented as a Week 7+ concern.
47. **`operationId` is auto-generated from method + path:** Renaming a path or switching a route's method would silently change the `operationId`, which is a breaking change for any consumer that generates an SDK from the spec.
48. **`operation-4xx-response` is off in `redocly.yaml`:** `/health` and `/ready` have no meaningful 4xx case. Disabled with a comment — the decision is recorded, not hidden.
49. **`/ready` is not checked by `precheck` at runtime:** `lint:openapi` is a build-time check. The `/docs` endpoint serves whatever the current `openApiSpec` says. `precheck` is the gate.
50. **No load testing:** Nothing measures the API under concurrency or sustained load. Week 7 adds a minimal load check against the deployed build.
51. **No contract test between the OpenAPI document and real responses:** Redocly lints the spec and `docs.and.auth.test.ts` checks `operationId`/401 coverage, but no test validates a real response body against the spec's schema. A future Ajv-based test closes this.


