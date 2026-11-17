# Testing TaskFlow

## The layers

| Layer | Where | Needs | Speed | What it proves |
|---|---|---|---|---|
| Unit | `tests/unit` | nothing | ~2 s | one function or rule, in isolation |
| Integration | `tests/integration` | PostgreSQL **and** Redis **and** Mailpit (only for `mail.smtp.test.ts`) | ~75 s | the real app, routes through SQL and a shared counter |
| Smoke | `npm run smoke` | a running server | seconds | the compiled build answers real HTTP |

## Commands

| Command | What it does |
|---|---|
| `npm test` | Unit tests, then integration tests |
| `npm run test:watch` | Re-run affected tests on save |
| `npm run test:coverage` | Unit + integration once, with coverage thresholds (90/78/96/92) |
| `npm run ci` | `precheck` + `test:coverage` — what CI runs |
| `npm run verify` | Build, start the compiled server, run unit + integration + smoke |
| `npm run jobs -- stats` / `failed` / `retry <id>` | Inspect and recover the BullMQ queue (needs Redis) |

## Test infrastructure

- **PostgreSQL:** `taskflow_test`, created and migrated by `tests/support/globalSetup.ts` on first run (`prisma migrate deploy`). Two safety layers refuse to touch any other database:
  1. `globalSetup.ts` refuses a URL whose database name doesn't match `/^[a-z0-9_]+_test$/`.
  2. `truncateAll()` runs `SELECT current_database()` and refuses if the name doesn't end in `_test`.
  Files run serially (`fileParallelism: false`) because they share one database.
- **Redis:** database **15** (pathname `/15`), never anything else. Two safety layers with the same shape:
  1. `assertTestRedis()` refuses any URL whose pathname isn't `/15`.
  2. `flushTestRedis()` calls `assertTestRedis()` again before `flushdb()`.
  The suite calls `flushTestRedis()` in `beforeAll` for the rate-limiter tests and in `beforeEach` for the store tests, so leftover counters from a previous run can't affect the results. `globalSetup.ts` probes Redis at startup and fails fast with a clear message (`Cannot reach Redis at redis://localhost:6379/15. Is it running? Try: npm run db:up`) if it isn't reachable.
- **Mailpit (Day 38):** `tests/integration/mail.smtp.test.ts` sends a **real** SMTP message through Mailpit (`smtp://localhost:1025`, web/API at `http://localhost:8025`) and inspects it via Mailpit's REST API. It is the only test that proves the SMTP path works end-to-end, including the header-injection defense (a `\r\nBcc:` in the subject cannot add a recipient). Mailpit is part of `npm run db:up`; if it isn't reachable, the test fails with `Cannot reach Mailpit. Is it running? Try: npm run db:up`. Every other integration test uses the **in-memory mailer** (`MAIL_TRANSPORT=memory`), so they stay fast and deterministic.
- **The test app runs with `REDIS_URL=""`** (`tests/support/env.ts` → `TEST_ENV`), so ordinary integration tests don't touch Redis; only the files that opt in (`ratelimit.test.ts` with the `"redis"` variant, `ratelimit.outage.test.ts`, `rateLimitStores.test.ts`) connect to Redis database 15. `.env` is never read because `dotenv` won't overwrite a variable that is already set — even when it's set to the empty string.
- **The test app runs with `JOBS_MODE=inline` and `MAIL_TRANSPORT=memory`** (`tests/support/env.ts` → `TEST_ENV`). Every assignment made through `POST /tasks` / `PATCH /tasks/:id` runs the handler **synchronously in the API process**, so the tests can assert on the email the moment the response arrives, without a worker or a Redis connection. The trade-off: **inline mode does not retry, back off, or move a job to the failed list.** Those behaviors are only proven by `tests/integration/jobs.queue.test.ts`, which runs a **real** `Worker` against Redis database 15 with a real `BullJobQueue`. If a test needs the queue semantics, it imports `BullJobQueue` / `startWorker` explicitly and does not use the shared `jobs` from `container.ts`.

## Conventions

- Tests for access rules use three personas: owner, member, stranger (`tests/support/scenarios.ts`).
- Arrange with factories (direct inserts), act through the API, assert on the response **and** the database.
- A refused request must change nothing: the access matrix compares a fingerprint of every table.
- Every test starts from empty tables; the helpers refuse to touch a database whose name does not end in `_test`.
- Write the failing test first when fixing a bug. After writing tests, break the code on purpose to check they notice.
- Rate limiters are tested with `X-Forwarded-For` per test, and the app copy with limits on is built via `vi.stubEnv` + `vi.resetModules()` + dynamic import.
- **The rate-limiter suite runs twice**: `describe.each(["memory", "redis"])("rate limits with the %s store", ...)`. Every behavior assertion (counts, 429 body, CORS, per-address/per-account/per-user keys) must pass against both stores. A failure only in the `redis` variant points at the store or the key logic; a failure in both points at something shared. The `redis` variant additionally has a **"Redis specifics"** block that inspects `rl:<limiter>:<key>` in Redis directly — without it, a silent fallback to `MemoryStore` would pass every behavior test.
- **The outage test points `REDIS_URL` at a port nothing listens on** (`redis://127.0.0.1:6390/15`) and asserts the app still starts degraded, the limiter still applies (`400 × 5, 429`), responses complete in well under 2 s (`enableOfflineQueue: false` + `commandTimeout: 500`), and `/ready` answers `200` with `{ status: "degraded", checks: { database: "up", redis: "down" } }`. It's slower than the other tests by design (the first connect attempt is what takes the time), but it's the only test that proves the failure policy actually holds.
- **The readiness tests use the injectable probe**, `createApp({ readiness })`, so `ok` / `degraded` / `unavailable` / `disabled` can be exercised without taking Docker down. `checkReadiness`'s own unit test additionally proves a hanging dependency is reported as `down` within `timeoutMs`, not hanging the probe.
- **Assignment tests run in `inline` mode with the in-memory mailbox** (`tasks.assignment.test.ts`). They assert on `outbox().sent`, not on HTTP responses, because in inline mode the handler runs synchronously — the email exists by the time the response is returned. The queue semantics (retries, backoff, `UnrecoverableError`, dead-letter list, graceful shutdown) are **not** covered by these tests; they are covered by `jobs.queue.test.ts`.
- **Queue tests close the worker in `afterEach` and poll with `waitFor`** (`jobs.queue.test.ts`). A leftover worker from one test would pick up the next test's job before that test's handler is registered, producing a "handler not called" failure that looks like a code bug but is a test-isolation bug. `waitFor` polls a condition with a short interval (20 ms) and a timeout (5 s) and fails with a clear message — never a fixed `sleep`.

## Known gaps

- ~~Rate limiter window expiry (the counter resetting after 15 minutes) is not tested — needs a faked clock inside the limiter's store.~~ **Closed on Day 36:** `tests/integration/rateLimitStores.test.ts` runs `RedisCounterStore` against real Redis with a short `windowMs` (300 ms) and a `sleep(400)`, asserting a fresh window starts from 1. The same file also covers "the window is not extended by later hits", "50 concurrent increments produce exactly 1..50", and "every key always has a TTL".
- **The in-memory fallback's per-instance behavior during an outage is verified, but the per-instance budget multiplier (N instances = N × limit) is not measured end-to-end.** The unit tests prove `ResilientStore` falls back and recovers; the outage test proves one instance still limits correctly. Whether two instances actually give twice the budget is a property of the design (`MemoryStore` per process), not something the suite exercises with multiple processes.
- **The queue's retry behavior, dead-letter list, and graceful shutdown are not exercised by `tasks.assignment.test.ts`** (Day 38). That file runs in `inline` mode, which is the right mode for testing the assignment rules and the "request never fails because a notification can't be queued" behavior — but it doesn't retry, back off, or move jobs to the failed list. Those are covered by `jobs.queue.test.ts`, which runs a **real** `Worker` and a `BullJobQueue` against Redis database 15. A test that says "the inline handler logged `job.inline_failed`" proves the *log line*; it does not prove the *retry policy*.
- **No end-to-end duplicate-delivery test** (Day 38). A worker that crashes between "sent" and "acknowledged" produces a duplicate email on the next delivery, and the handler's idempotency ("read the current task, skip if the assignee changed") is what makes it harmless. Testing that would need a worker killed at a precise point in the handler — the unit tests pin the "skip if changed" rule (`jobs/handlers.test.ts`), and the `jobs.queue.test.ts` "exhausts after the configured attempts" test pins the retry policy, but no test exercises the specific crash-between-send-and-acknowledge window.
- **The dual-write problem is documented, not tested** (Day 38). When Redis is down at the moment of assignment, the assignment is saved and the notification is lost (`job.enqueue_failed` is logged). A test could assert the log line, but there is no test that proves the **lost** email is lost — because the fix is the **outbox pattern** (Day 38 Challenge 1), which is not implemented. The failure table in `notes.md` is the record: "Redis down at assignment → email lost, not recovered."
- No load or performance tests.
- No browser tests.
- No contract test between the OpenAPI document and real responses.
- Coverage excludes `src/cli.ts`, `src/server.ts`, `src/utils.ts`, `src/worker.ts` (a process entry point, like `src/cli.ts`), and `src/generated/**`.