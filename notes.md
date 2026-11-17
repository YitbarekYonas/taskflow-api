# TaskFlow Notes

## What I learned

### Week 1 (CLI Core)
- **Node.js fundamentals:** the event loop, async/await, Promises, and how `process.argv` feeds CLI input.
- **Modules and structure:** splitting code into `types.ts`, `config.ts`, `storage.ts`, `commands.ts`, and `index.ts` — one job per file.
- **Environment and config:** reading `process.env`, loading `.env`, and validating config once at startup so failures happen fast and loud.
- **TypeScript:** type vs interface, literal and union types, narrowing, generics, utility types, discriminated unions, and the `never` check in switches.
- **Zod:** validating data from outside the program (JSON file contents, env values) at the boundary so internal code can trust its types.
- **Streams:** readable/writable/transform streams, and why `pipeline()` handles errors and cleanup better than `.pipe()`.
- **Git workflow:** branches, pull requests, squash merges, conventional commits, merge conflict resolution, and safe undo tools (`restore`, `stash`, `revert`, `reflog`).

### Week 2 (Express API)
- **HTTP & Express:** middleware pipeline, routers, error-handling middleware (4 args), treating `req.body`, `req.query`, and `req.params` as untrusted.
- **REST Design:** using nouns in URLs, proper status codes (200, 201, 204, 400, 404, 409, 500), and pagination/sorting/filtering envelopes.
- **Repository Pattern:** separating business logic (services) from data storage (repositories). Services depend on an interface, not a specific implementation.
- **Dependency Injection:** using a `container.ts` composition root to wire dependencies together.
- **Referential Integrity:** enforcing relationships (tasks belong to projects) and using `409 Conflict` for state violations.
- **Production Middleware:** Helmet, CORS allow-lists, Request IDs (`X-Request-Id`), and body size limits.
- **Nested Routes & IDOR:** Using `Router({ mergeParams: true })` to nest comments under tasks, and preventing Insecure Direct Object Reference (IDOR) by verifying the comment belongs to the task in the URL.
- **OpenAPI & Smoke Tests:** Generating Swagger docs from Zod schemas to prevent drift, and writing a smoke test to verify the running API.

### Week 2 (PostgreSQL First Contact)
- **SQL Basics:** `LIMIT` and `OFFSET` are your `page` and `limit`. `WHERE` is your filter and `ORDER BY` is your sort.
- **Atomic IDs:** `SERIAL` generates IDs atomically, so the ID-reuse problem and the race condition from Day 9 disappear.
- **Constraints & Cascades:** Foreign keys and `ON DELETE CASCADE` replace the hand-written checks in your services. The DB enforces them atomically.

### Week 3 (Prisma & Database Schema)
- **Prisma ORM:** Describing tables as models and generating a typed client. `prisma.task.findMany()` is checked by TypeScript.
- **Schema-first workflow:** Editing `schema.prisma` and running `prisma migrate dev` to write SQL migration files.
- **Relations:** Explicit join tables (`ProjectMember`) for many-to-many relationships that carry data (like `role`).
- **`onDelete` rules:** `Restrict` (block delete, like our 409), `Cascade` (delete children, like our comments), and `SetNull` (unassign tasks).
- **Indexes:** Indexing foreign keys (`projectId`) and frequently filtered columns (`status`) so the database doesn't have to scan the whole table.

### Week 3 (Swapping Repositories)
- **Data Mapping:** Translating between the domain (`Date` vs ISO string, `undefined` vs `null`) at the repository boundary.
- **The `undefined` trap:** Prisma treats `undefined` as "don't touch", while `null` means "set to NULL".
- **Error Translation:** Catching Prisma's `P2025` (record not found) and returning `undefined` to the service.
- **Connection Pooling:** Prisma keeps connections open, so CLIs must call `prisma.$disconnect()` to let the Node process exit.

### Week 3 (Database Constraints & N+1)
- **Trusting the Database:** Removed manual checks (`assertProjectExists`) and cascades. Prisma's `P2003` error is mapped to `InvalidReferenceError` (400 on insert) or `InUseError` (409 on delete).
- **N+1 Problem:** Loading a list then running a query per item. Fixed by using Prisma's `_count` to get counts in a single query.
- **Nested Queries:** Added `GET /projects/:id/tasks` to reuse task filtering for a specific project.

### Week 3 (SQL Pagination & Performance)
- **Pushing work to the DB:** Moving `filter`, `sort`, and `slice` from JavaScript into SQL `WHERE`, `ORDER BY`, and `LIMIT/OFFSET`.
- **Stable sorting:** Adding an `id` tie-breaker to prevent pagination from skipping or duplicating rows when there are ties.
- **Indexes:** Adding composite indexes (`@@index([status, dueDate, id])`) to match the query shape and avoid full table scans.
- **`EXPLAIN ANALYZE`:** Reading query plans to see `Seq Scan` vs `Index Scan` and measuring execution time.
- **Search wildcards:** Discovering that `%` and `_` in `ILIKE` act as wildcards, matching everything if not escaped.

### Week 3 (Transactions & Unit of Work)
- **Atomicity:** Using `prisma.$transaction` to ensure that either all operations in a block succeed or none do. This prevents half-copied projects or orphaned tasks.
- **The `tx` rule:** Inside an interactive transaction, every query *must* use the `tx` client. If you accidentally call `prisma`, it runs outside the transaction and won't roll back.
- **Unit of Work pattern:** An interface (`UnitOfWork`) that wraps `$transaction` and provides repositories bound to that transaction. Services stay decoupled from Prisma.
- **Deadlocks:** How concurrent transactions touching the same rows in different orders can lock each other up. Fixed by locking in a consistent order or retrying (`P2034`).

### Week 3 (Migrations & Seeding)
- **Migration Ledger:** Prisma stores checksums of applied migrations in `_prisma_migrations`. Editing an applied migration breaks the history.
- **Safe Renames:** Prisma generates `DROP` + `ADD` for renames (data loss). Fixed by using `--create-only` and editing the SQL to `RENAME COLUMN`.
- **Expand → Backfill → Contract:** Adding a `NOT NULL` column to a table with data requires three steps: add as nullable, update existing rows, then set to `NOT NULL`.
- **Idempotent Seeds:** Using `upsert` so running the seed multiple times doesn't duplicate data.
- **Migration Check Script:** Spinning up a scratch database, applying all migrations (`migrate deploy`), and using `migrate diff` to ensure `schema.prisma` matches the migrations.

### Week 4 (Authentication & Hashing)
- **Argon2id:** Deliberately slow and memory-hungry. The current standard for password hashing. Avoids SHA-256 (too fast) and MD5 (broken).
- **Hashing vs Encryption:** Hashing is one-way, encryption is reversible. Passwords must be hashed, never encrypted.
- **Salt:** A random value added to each password before hashing. Prevents rainbow table attacks. Argon2 stores the salt inside the hash string.
- **Unique Constraints for Duplicates:** Instead of a racy "check then insert", let the database reject duplicate emails with a `P2002` error, mapped to a `409`.
- **Mass Assignment:** Using `.strict()` in Zod to reject unknown fields like `role: "admin"` or `id: 1`.
- **Email Normalization:** Trimming and lowercasing at the schema level so `Sam@Example.com` and `sam@example.com` are the same account.
- **No Secrets in Responses:** The `User` type deliberately excludes `passwordHash` so the compiler prevents accidentally returning it.
- **JWT (JSON Web Token):** Three base64url parts (`header.payload.signature`). Signed by the server, readable by anyone. Never put secrets in the payload.
- **Algorithm Pinning:** Always verify with `algorithms: ["HS256"]`. This prevents `alg: none` and algorithm confusion attacks.
- **Timing Attacks:** Even with identical error messages, a login endpoint can leak whether an email exists if the response times differ. Fix: always run a dummy hash when the user isn't found.

### Week 4 (Authorization & Ownership)
- **401 vs 403 vs 404:** `401` = "Who are you?" (missing/invalid token). `403` = "I know you, but you can't do this." `404` = "That doesn't exist" (used when existence itself is private).
- **Default Deny:** A route is private unless explicitly marked public. `authenticate` is attached to the router mount so it runs before `validate`, preventing anonymous users from learning your schema.
- **Ownership Policy:** `assertOwner(actor, ownerId)` in `src/auth/policy.ts`. If `ownerId` is `undefined` (legacy rows), only `SYSTEM` can modify it.
- **The `Actor` Type:** An explicit `Actor` argument (`user` or `system`) is passed to every service mutation method. It's impossible to forget, because TypeScript will refuse to compile.
- **BOLA / IDOR:** Broken Object Level Authorization. The defense is `assertOwner(actor, task.createdById)` in the service.
- **Auth Coverage:** A script (`test:auth-coverage`) iterates through every documented route and asserts it returns `401` without a token (unless marked public).

### Week 4 (Sessions & Refresh Tokens)
- **Stateless vs Stateful:** Access tokens are stateless (can't be revoked). Refresh tokens are stateful (stored in DB, revocable).
- **Opaque Tokens:** Refresh tokens are 256 random bits. The server looks them up. No decoding, no forging.
- **Storing Hashes:** The DB stores `SHA-256(token)`, not the token itself. If the DB leaks, the tokens are useless.
- **Rotation:** Every refresh issues a new token and marks the old one used. A stolen token is only useful once.
- **Reuse Detection:** If a used token is replayed, the entire family is revoked. This ends the theft at the cost of one annoyed user.
- **Atomic Updates:** `UPDATE ... WHERE used_at IS NULL` ensures exactly one winner in a race. This prevents parallel refreshes from duplicating tokens.
- **Logout:** Revokes the family. Idempotent and silent (always `204`) to prevent enumeration.
- **The Limit:** Logout kills the refresh token but **not** the access token. The access token remains valid until it expires (15 min).

### Week 4 (Roles & Project Membership)
- **Horizontal vs Vertical Escalation:** Horizontal = reaching another user's data at your own level. Vertical = doing something your role forbids (e.g., a member renaming the project).
- **Roles Belong to the Resource:** A user can be an `owner` of one project and a `member` of another. The role lives on the `ProjectMember` row, not the user.
- **Stranger vs Member vs Owner:** Strangers get `404` (existence is hidden). Members get `403` for owner-only actions. Owners have full control.
- **No Ownership in the JWT:** Roles are looked up on every request. Removing a user from a project takes effect immediately (no waiting for a 15-minute token expiry).
- **Filter Lists in SQL:** `GET /tasks` filters by membership in the `WHERE` clause. This prevents leaking hidden rows via `meta.total`.
- **Comment Authorship:** The author is the logged-in user. A client cannot forge `author` in the body.
- **The Last-Owner Invariant:** `SELECT ... FOR UPDATE` locks the project row while checking if the last owner is being demoted/removed. Without it, two concurrent demotions can leave zero owners.
- **Locking:** The row lock prevents the race condition. The check is done **twice** (before and after acquiring the lock) to ensure the user is still an owner after waiting.

### Week 4 (Rate Limiting & Security Review)
- **Rate limiting:** Prevents brute-force, credential stuffing, scraping, and enumeration. It's not a perfect defense, but it raises the cost of attacks.
- **The key matters:** Per-IP (before login, shared by many), per-account (protects a victim, but allows lockout), per-user (precise, only after auth).
- **`trust proxy`:** Must exactly match the number of proxies in front of the app. Too high → attackers can forge `X-Forwarded-For` and bypass limits. Too low → everyone behind a proxy shares one IP (false blocks).
- **Rate limit headers:** `429` with `Retry-After` and `RateLimit` headers tells clients when to back off.
- **Security headers:** Helmet sets `X-Content-Type-Options`, `Strict-Transport-Security`, etc. `X-Powered-By` is removed.
- **CORS:** Browsers block cross-origin requests unless the server allows them. `curl` ignores CORS.
- **NUL characters and out-of-range integers:** PostgreSQL rejects both with a `500`. Zod must reject them first with a `400`.
- **OWASP API Top 10:** All ten risks were reviewed. Most are addressed (BOLA, authentication, authorization, etc.). API7 and API10 are not applicable yet.
- **Secret scanning:** `gitleaks` found no secrets in 123 commits. `npm audit` found 0 vulnerabilities.

### Week 5 (Testing & Quality)
- **Vitest:** A fast unit test runner. Tests live in `tests/unit/` and mirror the `src/` structure.
- **Test isolation:** `vitest.config.ts` sets all environment variables, so tests never depend on the developer's `.env`. `restoreMocks: true` prevents spies from leaking between tests.
- **Fake vs Spy:** Use a **fake** (a tiny working implementation) for interfaces like `MemberRepository`, because it survives refactors. Use a **spy** (e.g., `vi.spyOn(process, "exit")`) only when you need to intercept a side effect.
- **Faking only `Date`:** `vi.useFakeTimers({ toFake: ["Date"] })` controls token expiry without breaking async crypto functions that rely on timers.
- **Mutation testing:** Deliberately breaking the code to prove the tests catch it. If a test doesn't fail, the test is useless.
- **Coverage:** 15.5% coverage is correct after Day 29. It's 100% on pure logic (pagination, slugs, auth helpers, schemas) and 0% on plumbing (controllers, repositories). Integration tests will cover the plumbing.

### Week 5 (Integration Testing & Test Database)
- **Integration tests run the real code with real dependencies:** your HTTP layer, your validation, your Prisma queries, and a real PostgreSQL. They catch bugs unit tests can't: wrong column names, missing migrations, constraint surprises, middleware order.
- **Don't mock the database to test your data layer.** A mocked Prisma returns whatever you tell it to, so the test proves nothing about your SQL. Mock things you don't own (external APIs); run things you can run (PostgreSQL).
- **Supertest calls the app directly.** `request(app).get("/health")` starts a throwaway server on a random port for that one request. No `npm run dev`, no port clashes. This works because `createApp()` has been separate from `server.ts` since Day 8.
- **Isolation strategy #1: truncate all tables before every test.** Simple, obviously correct, a few milliseconds. Faster strategies (transaction rollback, per-worker DBs, Testcontainers) exist and are noted as challenges.
- **A shared test database means files must not run in parallel.** `fileParallelism: false` in the integration config; two files truncating the same tables would wipe each other's data mid-test.
- **Two layers of protection against wiping the wrong database:**
  1. `globalSetup.ts` refuses any database name not matching `/^[a-z0-9_]+_test$/`.
  2. `truncateAll()` runs `SELECT current_database()` and refuses if the result doesn't end in `_test`.
  Layer 1 trusts the URL string. Layer 2 trusts the actual connection. A bug in dotenv loading, or a mid-flight env change, could make the two disagree — only layer 2 notices.
- **Migrate the test database from migration files.** `prisma migrate deploy` before the suite means the tests also prove your migrations work from scratch. This is the same guarantee `npm run db:check-migrations` was giving you, now a side effect of any integration run.
- **Assert the contract, not the noise.** Status code, body shape, headers. Use `expect.any(Number)` for auto-incremented IDs, `expect.any(String)` for ISO timestamps. Never assert a specific clock value.
- **Assert side effects where they happen.** A registration test should also look in the database: one row, the hash is Argon2, the password is not stored. A response that says "created" proves little by itself.
- **Factories beat repeated setup.** `createUser()` inserts a user directly with a pre-hashed password (cached once). A login test then doesn't pay for a registration, and can't fail because registration broke.
- **Some properties are poor automated tests.** "A wrong email and a wrong password take the same time" depends on the machine; a test for it would be flaky. Measure with `npm run bench:login`, keep it out of the suite. Choosing *not* to test something is part of testing well.
- **Test the test infrastructure.** `tests/integration/safety.test.ts` proves: the DB name ends in `_test` (both layers), all migrations applied (`_prisma_migrations` count > 0), `beforeEach` truncates between tests, `RESTART IDENTITY` gives predictable IDs (`createUser().id === 1`).
- **`verify.sh` runs every script against one long-lived server, so scripts share in-memory rate-limit budget.** `test:ratelimit` assumes a fresh server; it must run *first* in the `for step in` loop, before any other script drains the register/refresh/login counters. This was a pre-existing latent flakiness made visible once more scripts accumulated.
- **The green suite proves three things:** the migration history is reproducible from empty, the test DB is isolated from dev, and the two safety layers fire before any destructive operation.

### Week 5 (Tasks, Projects & Red-Green-Refactor)
- **Arrange through the database, act through the API, assert through both.** Factories set up the world directly (fast, typed). The request goes over HTTP (the thing under test). The assertion reads the response *and* the rows. A `204` proves nothing if the row is still there.
- **Test personas, not roles in the abstract.** Every authorization test uses the same cast — an owner, a member, a stranger — and names them that way in the code (`team()` returns `{ owner, member, stranger, project }`). A failing test then reads like a sentence, not like a fixture.
- **Order needs explicit data.** For sorting, give every row its own `createdAt`. Never rely on "created a millisecond apart". For ties on `priority` / `dueDate`, resolve them with `id` so the expected list is fully defined.
- **"Invisible" must equal "missing".** A stranger requesting a hidden task or project gets exactly the same `404` and message shape as a request for an id that doesn't exist — otherwise the endpoint leaks existence. Tests assert message equality modulo the id.
- **Failure side effects matter.** A forbidden delete must leave the row in place. A failed merge must leave **both** projects untouched, with no task moved. This is how atomicity is tested from outside.
- **Boundary arithmetic belongs in unit tests with an injected clock.** "Is today in the past?" is a pure function `isPastDate(date, today)`. "A past due date returns 400" is an API behavior. Same rule, two tests, no flakiness.
- **Red-green-refactor is a discipline, not a slogan.** The red phase is not "write a test". It's "write a test, run it, and confirm it fails *for the expected reason*". If a different test fails, stop — you have a stale assumption or an unrelated bug.
- **`nulls: "last"` and its asymmetry.** PostgreSQL's defaults are nulls-last for `ASC` and nulls-first for `DESC`. A suite that checks only one direction would let the desc bug live. Row 4 of the mutation table exists specifically to demonstrate this.
- **"It passed" is not "it's safe".** Row 7 (remove the `id` tie-breaker on `priority`) may survive on a small table because PostgreSQL's tie ordering is accidentally stable. A test suite can prove presence of bugs, not their absence. Day 18's smoke test failure is the anecdote; this is the generalization.
- **Concurrency is testable with `Promise.all`.** Two simultaneous merges → exactly one `200`, the loser is `404` or `409`, and the target ends with the right task count. The assertion must hold for every interleaving, not one lucky ordering.
- **The CLI is exempt from business rules that are about user input.** The due-date guard is `actor.kind === "user" && isPastDate(dueDate)`. `SYSTEM` (CLI, imports, data fixes) is not subject to it, by design. This is a documented decision, not a loophole.
- **UTC date is a decision, not a default.** The rule uses `todayUtc()`, so a user in UTC−8 can be rejected at 22:00 local for setting "today" in their time zone. Documented in `notes.md` with the tradeoffs (accept vs. grace day vs. `Time-Zone` header).

### Week 5 (Access Matrix, Sessions, Coverage & Retirement)
- **A persona-by-action table is the best test for authorization.** Every cell is one test (24 actions × 3 personas = 72 tests). A missing cell is visible; a wrong cell is a failing test with a readable name (`stranger → 404`, `member → 403`, `owner → 200`).
- **A denied request must change nothing.** The matrix takes a **fingerprint** of every table before and after each denied request and requires them identical. A `403` *after* an update would pass a status-only test but fail a fingerprint. This is how authorization is tested from outside.
- **Characterization tests record today's behavior, including known limitations.** "An access token still works after logout" isn't a feature — it's a documented limitation of stateless tokens. A test that says so stops it being forgotten or silently changed.
- **Race tests need repetition.** A race that happens one time in ten won't show in one run. Loop the scenario 5 or 10 times, and assert something that must hold for *every* interleaving: exactly one 200, never zero owners. The parallel refresh test (`exactly one of 6 succeeds`, 5 rounds) and the last-owner race (10 rounds, 0 violations) both follow this.
- **Don't assert what is genuinely non-deterministic.** In the parallel-refresh test, exactly one 200 wins, but *which* one, and whether the winner's new token survives the losers' family revocation, depends on timing. Assert the first, never the second.
- **Coverage answers "what did no test ever run?", not "what is well tested?".** A line can run without a single assertion about it. Use coverage to find *gaps*, and mutation checks to judge *quality*.
- **Branch coverage matters more than line coverage.** `if (a) x(); else y();` is one line and two outcomes. The Day 32 report shows branches (75.12%) well below statements (88.07%) — that's where the honest gaps are.
- **Thresholds are a ratchet.** Set them just below today's numbers so coverage can't drop unnoticed, and raise them when it rises. Never lower one to make a build pass. A threshold of 100% invites tests written for the number, not for behavior.
- **Excluding files from coverage is a decision, not a hiding place.** Generated code (`src/generated/**`) and process entry points (`src/cli.ts`, `src/server.ts`) are excluded. Hard-to-test code is *not* excluded for that reason — it's documented as a gap.
- **Retire a test only after proving its replacement catches the same bugs.** Delete first and you can't know what you lost. For each script, re-introduce a bug it once caught and confirm the suite fails.
- **The rate-limiter test exposed a double-mount bug.** Mounting `registerLimiter`, `loginIpLimiter`, and `refreshLimiter` twice (once in `app.ts` by path, once in `auth.routes.ts` on the routes) halved the effective limit of every IP-keyed limiter (5→2, 60→30, 30→15). Diagnosed with a 10-line probe (`scripts/limiter-probe.ts`) that read the `RateLimit` response headers. Fixed by keeping only `globalLimiter` in `app.ts`.
- **Keep one smoke test.** The suite runs your source through Vitest. Only `smoke.ts` runs the **compiled** `dist/` server over real HTTP — the thing that actually ships. It stays small (~12 checks) and runs after every deploy in Week 7.
- **`verify.sh` restarts the server between `smoke` and `test:ratelimit`.** The limiter's in-memory counters reset on restart, so `test:ratelimit` gets a fresh budget even though it runs after `test:integration` and `smoke`. Combined with the double-mount fix, this makes `verify.sh` green end-to-end.

### Week 5 (Linting, Formatting & Git Hooks)
- **Three tools, three jobs.** The **compiler** checks types. The **linter** (ESLint) finds code that type-checks but is probably wrong. The **formatter** (Prettier) decides how code looks. They overlap very little; they are not interchangeable.
- **Don't make the linter do formatting.** Prettier formats. ESLint finds bugs. `eslint-config-prettier` switches off ESLint's style rules so the two never fight, and it goes **last** in the config.
- **Type-aware rules are the valuable ones.** `no-floating-promises` catches a promise nobody awaited (a silently failing DB write). `no-misused-promises` catches an `async` function passed where a plain callback is expected, so its rejections vanish. These need type information, which makes linting slower (seconds, not ms).
- **Flat config.** Modern ESLint uses one `eslint.config.mjs` (no `.eslintrc`, no `.eslintignore`). Ignores are a config block with only `ignores`. Order matters: later blocks override earlier ones.
- **Errors, not warnings.** A warning nobody fixes is noise, and a codebase with 300 warnings has stopped reading them. Use `error` + `--max-warnings 0`.
- **Choose rules deliberately.** A rule is worth having if it prevents a *real* bug class. A rule that fires on correct code teaches people to ignore the linter. Turned `require-await` off on purpose and wrote why.
- **Disabling a rule is a decision, so explain it.** `// eslint-disable-next-line rule -- reason`. `reportUnusedDisableDirectives` makes a stale disable an error.
- **A big reformat is its own commit.** Mixing "format everything" with a logic change makes the diff unreadable. Do it alone, then list that commit in `.git-blame-ignore-revs` so `git blame` skips it.
- **Hooks are for speed, CI is for truth.** A pre-commit hook should take ~2s, so it only checks **staged files** (`lint-staged`). Slower checks go in `pre-push` or CI. Hooks live on each dev's machine and can be skipped (`git commit --no-verify`); only CI is a real gate (Week 7).
- **Linters can enforce architecture.** `no-restricted-imports` per folder turns "controllers must not talk to the database" from a convention into a failing check (an *architecture fitness function*). Day 11's composition-root decision became executable.
- **`prepare: "husky || true"`.** Husky installs via an npm `prepare` script. A production `npm ci --omit=dev` doesn't install Husky, so `"prepare": "husky"` would crash the install. The `|| true` is the Week 7 safeguard.
- **The parser version pins ESLint's choice of TypeScript.** `typescript-eslint` needs a TypeScript API. The project's `typescript` was 7.x (native Go compiler, API removed), so `npm i -D eslint typescript-eslint ...` failed with `ERESOLVE`. Fixed with the official side-by-side alias: `@typescript/native@npm:typescript@^7.0.2` + `typescript@npm:@typescript/typescript6@^6.0.2`. `npx tsc` → 7.0.2, `npx tsc6` → 6.0.3, both work.
- **24 findings on the first run is normal.** `recommendedTypeChecked` is aggressive. Read the *top five rules*, not every line. Triage by category (delete dead code, fix the real bug, narrow types, one disable-with-reason), not by file.
- **Disable a rule once, at the top of a file, with a reason.** The `errorHandler.ts` case (`no-unsafe-member-access` × 10 on Express's untyped error objects) is the textbook example. A full `errorShape()` guard is a Day 34+ job; one disable comment is the honest answer this week.

### Week 5 (Structured Logging with pino & AsyncLocalStorage)
- **Structured logs are data, not sentences.** `{"level":30,"event":"http.request","status":404,"path":"/tasks/9","requestId":"…"}` can be filtered (`status >= 500`), counted, and graphed. `"GET /tasks/9 404 12ms"` can only be grepped. Keep the message short and constant, put the *variables* in fields.
- **Stable event names.** A field like `event: "auth.refresh_reuse"` is something an alert can match for years. A sentence will be reworded next month.
- **Levels mean something.** `error` is a bug or an outage someone should look at. `warn` is something suspicious but handled (a 401, a rate limit). `info` is normal business. `debug` and `trace` are for development. A log full of `error` lines for every 404 gets ignored.
- **Pino numeric levels:** trace 10, debug 20, info 30, warn 40, error 50, fatal 60. Output is JSON on stdout. **The app does not format, rotate, or ship logs.** The platform does. Pretty printing is a development-only pipe (`| pino-pretty`).
- **Correlation: the request ID.** One request produces several lines. If every line carries the same `requestId`, you can reconstruct what happened. The ID is returned to the client in `X-Request-Id` and in 500 responses.
- **`AsyncLocalStorage` (ALS) is "a global variable per request".** Code deep inside a service can log with the right request ID without every function taking a `requestId` argument. The catch: the stored value follows **promises, timers, and `await`**, but **event listeners run in the context of whoever calls `emit`**. `express.json()` calls `next()` from a stream event, so a context created before the body parser would be lost for `POST` requests. **Put the context middleware after the body parser.**
- **`mixin()` adds fields to every line.** Pino calls it on each log call. We use it to attach the request context. A field passed explicitly in the log call wins over the mixin, so keys are never duplicated.
- **Redaction is by key name.** `redact: { paths: ["*.password"] }` replaces any `password` field at that depth with `[Redacted]`. It does **not** catch a secret inside a message string, a field with a different name (`pwd`), or something nested deeper than your paths. Redaction is the last safety net; the first defense is **not putting the secret in the log call**.
- **Errors can carry secrets.** A Prisma error's `message` embeds the failing query *including argument values* (a password hash, an email). Logging `{ err }` with the default serializer would write them to disk. **Write a serializer that keeps only the final line and drops `meta`.**
- **Don't log personal data you don't need.** Record the **path**, not the query string, not request bodies, not email addresses. The login form's email field is where people sometimes paste their password by mistake.
- **Linting documentation.** `redocly lint` checks an OpenAPI file against rules (every operation has an `operationId`, tags have descriptions, no unused components). Generated clients and docs tools rely on those fields, so catching gaps in CI is cheap. **`operationId` must be unique** — auto-generate from method + path so it's unique by construction.

### Week 5 (Day 35 — Wrap-up, Release & Redis First Contact)
- **Redis is a very fast key-value store in memory.** Typical uses: counters, caches, queues, locks and pub/sub. Everything is optional-by-design: data can expire, and an unconfigured Redis can lose recent writes on a crash. Never make it the only copy of something you can't recreate.
- **`SET ... EX` and `TTL` are the fixed-window rate-limiter in one command.** The second `INCR` doesn't reset the clock, so the window is fixed from the first request. That's why a limiter on Redis is simpler and more correct than one in process memory.
- **`SET key value NX EX 30` is an atomic lock.** Two workers racing to claim the same job: one gets `OK`, the other gets `nil`. No check-then-set race. This is the Redis version of `SELECT ... FOR UPDATE`.
- **`INCR` is atomic on a single-threaded server.** Repeating Day 9's race against Redis (two terminals, 1000 increments each) returns exactly 2000. The file-based counter lost updates because it wasn't atomic; Redis's `INCR` is one step.
- **Never `KEYS *` in production.** It scans the whole keyspace and blocks the single thread. Use `SCAN` to iterate incrementally.
- **Your rate limiters are per process.** The counters live in each Node process's memory. With two instances behind a load balancer, a client gets double the budget, and a restart resets the counts. A shared Redis store fixes both (Day 36).
- **Cache-aside is the standard pattern.** Read the cache; on a miss, read PostgreSQL and store the result with a **TTL**. Writes **invalidate** the affected keys. The hard part is knowing *which* keys a write affects.
- **A cache must respect authorization.** A cached "dashboard stats" response is visible to whoever can read that key. If the key doesn't include the user or project, you've built a data leak that no permission check will catch (Day 37 tests this).
- **Redis is a network dependency with its own failure modes.** If it's down, should the limiter let everyone through (fail open) or reject everything (fail closed)? Should a missing cache slow requests down or break them? Week 6 makes these decisions explicitly.
- **A thundering herd (cache stampede).** When a popular key expires, a hundred requests all miss at once and hit the database together. Remedies: jittered TTLs, or a short lock so only one request refills the cache.
- **Characterization tests come before a storage swap.** The rate limiters were tested only by a hand-written script. Before Week 6 moves their counters to Redis, they are tested inside the suite, describing today's behavior. That's the safest way to change what's underneath: the tests tell you if behavior changed.
- **The suite builds its own copy of the app for rate-limiter tests.** `vi.stubEnv("RATE_LIMIT_ENABLED", "true")` + `vi.resetModules()` + `await import(...)` gives a fresh app with limits *on*. The shared test app has limits off so ordinary tests can send as many requests as they like. Each test pretends to be a different client with `X-Forwarded-For` (the test app trusts one proxy hop). This is test isolation at the module level.
- **A standalone script can hide a bug the suite would catch.** The rate-limiter double-mount halved every IP-keyed limit; the standalone script's failure message blamed a fresh-server assumption, which was wrong. Moving the tests into the suite made the real symptom (counts dropping by 2) visible in the response headers.
- **Docs can drift, so test them.** README and `.env.example` were wrong before (stale script names, a missing variable). Tests parse the README for `npm run <script>` mentions, parse `.env.example` for `KEY=`, and compare both to `envSchema.shape`. The changelog test requires a section for the current `package.json` version. Fix the docs, not the test.
- **Coverage ratchets in two places now.** The `ci` script runs `test:coverage`, so the threshold is enforced in CI (and by `precheck`). The threshold itself is set to the measured value minus 2, rounded down, and only goes up.
- **Mutation tables catch what a coverage number can't.** Row 8 of the Day 35 table (removing the `id` tie-breaker on `priority`) survives on a small table because PostgreSQL's tie ordering is accidentally stable. The right response is to trust the *known* rule (tie-breaker required), not the green test. A coverage number would never see it.
- **A test that doesn't fail for the right reason is a bug in the test.** The rate-limiter suite's first run showed failures in exactly the limiters whose mounts had been doubled. That's the diagnostic. If a different limiter had failed, the test setup or a shared budget would be suspect, and the fix would be in the test, not the code.
- **The fresh-clone test proves the docs work.** Clone the repo into a new directory, `cp .env.example .env`, `npm install`, `npm run setup`, `npm run ci`, `npm run verify`. If it passes, the README and `.env.example` are complete and the setup has no hidden dependency on your machine. The `taskflow_test` database is created by global setup from migrations — that's the proof.
- **Release tags are the history recruiters read.** `v0.5.0` with a changelog section (breaking changes first) is the artifact. The README's live-demo link and CI badge come in Week 7.

### Week 6 (Day 36 — Redis in Docker Compose & Shared Rate-Limit Counters)
- **A shared counter needs an atomic increment.** Two Node processes cannot share a number in memory. `INCR` on Redis's single thread is one step; Day 9's read-modify-write was not. The two-instance experiment makes the difference visible: without a shared counter, each process counts to 3 against its own limit of 5, and **no** request is limited; with Redis, five requests across both processes consume the shared 5/hour budget and the sixth is 429.
- **The fixed-window limiter is three commands in one transaction.** `INCR key`, `PEXPIRE key windowMs NX`, `PTTL key`, wrapped in `MULTI`/`EXEC`. The `NX` is load-bearing: without it, every hit resets the window and a client is never unblocked. With it, the window starts once, on the first hit, and expires after `windowMs` regardless of later traffic.
- **Every key must expire, and the store must not resurrect an expired key without a TTL.** A plain `DECR` on an expired key creates a key with **no** expiry, so the counter blocks forever. The Lua `if EXISTS then DECR else 0` guard prevents that. The `PTTL < 0` fallback in `increment` re-applies the TTL if the transaction ever leaves a counter with no expiry.
- **`express-rate-limit` increments *then* compares**, so a request that gets blocked still leaves the counter at `limit + 1`. The register limiter's key shows `6` after five `400`s and one `429`. A `skipSuccessfulRequests` limiter (`loginIpLimiter`) decrements on success, so its count stays honest; a limiter without it (register) counts every request including the blocked one.
- **`ipKeyGenerator` normalizes IPv6 to a subnet, not a single address.** Two clients in the same `/56` share one budget, which stops an attacker rotating through the block. The key becomes `rl:register:::/56`, not `rl:register:::1` — a `get` on `:::1` returns nothing (`PTTL -2`) even though the counter exists.
- **Every limiter's `name` is part of its key (`rl:<name>:<key>`), so names must be unique.** Two limiters with the same name share a counter — the register and refresh limiter would merge, halving one and doubling the other. The mutation table's row 2 tests this: give `refresh` the name `register` and **only the redis variant** of the rate-limit tests fails, because the memory variant has separate stores and can't see the collision. This is exactly the case the `describe.each(["memory", "redis"])` restructure exists to catch.
- **A Redis store must implement the `Store` interface without hiding its shape.** `express-rate-limit`'s `Store` has an optional public `prefix` property; a class cannot declare `private prefix` in its place. Rename the private field (`keyPrefix`) and pass positionally. `init(options)` is `void | Promise<void>`; `increment` returns `ClientRateLimitInfo | Promise<ClientRateLimitInfo>`; `decrement`/`resetKey` return `void | Promise<void>`. An `async` method with `await`/`return await` satisfies both `no-floating-promises` and the interface; `void this.run(...)` satisfies the lint but breaks the type. `void this.primary.init?.(options)` in `init` is the only place `void` is correct.
- **Fail fast on a dead Redis.** `enableOfflineQueue: false`, `maxRetriesPerRequest: 1`, `connectTimeout: 2s`, `commandTimeout: 500ms`. With the default `enableOfflineQueue: true`, commands queue during an outage and the request stalls for seconds; with it off, the request fails in ~1ms and the fallback store answers. The `retryStrategy` keeps the connection retrying in the background without blocking requests.
- **The `error` event fires on every failed retry.** Without a throttle, an outage logs 5+ lines per second. The 30-second `ERROR_LOG_INTERVAL_MS` (and the separate 30-second fallback-log throttle) reduce this to one line each. `redis.ready` on recovery is one line, and it's what confirms the retry succeeded.
- **Redis is a network dependency with a failure policy per feature.** The limiter degrades to per-instance memory (fail open would remove the limit; fail closed would 503 every login). `/ready` reports `degraded` but stays `200` (the load balancer should keep routing). Startup proceeds without Redis (a deploy-time hiccup must not take the API down). All three are written down in a table **before** the code, so the choice isn't made by whatever error the first `redis.get()` throws.
- **A readiness probe needs a deadline.** `checkReadiness` wraps each dependency check in `Promise.race` against a `setTimeout(...)`; a hanging database is reported as `down` instead of hanging the probe. `unavailable` (database down) returns 503; `degraded` (Redis down) returns 200; `disabled` (no `REDIS_URL`) is `ok`.
- **Two probes must be exempt from the global rate limiter.** `/health` and `/ready` are polled every few seconds by the load balancer and orchestrator; without a `skip`, a health-check storm would 429 the probes and trigger an orchestrator restart loop. `skip: (req) => req.path === "/health" || req.path === "/ready"` is the exact fix.
- **A store can be swappable if its behavior is pinned first.** Day 35's characterization tests are unchanged today. The new suite runs them **twice**, once against `MemoryStore` and once against the `RedisCounterStore` + `ResilientStore` pairing — the same assertions, two storages. If the redis variant fails and the memory variant passes, the store or the key logic is wrong; if both fail, something shared broke.
- **The redis variant of the suite needs its own assertions to prove it isn't vacuously passing.** If `connectRedis()` returned `false` (Redis unreachable), `buildStore` would return `undefined` and the memory store would be used silently — every behavior test would still pass. The "Redis specifics" block inspects `rl:register:<ip>` in Redis directly: `"1"` with a positive `PTTL`, and no email in any `rl:*` key. That's the proof the counter is actually in Redis.
- **Tests must not silently use the developer's Redis.** `tests/support/env.ts` sets `REDIS_URL: ""` in `TEST_ENV` for the same reason it sets `DATABASE_URL`: an empty string exists in `process.env`, so `dotenv` doesn't overwrite it with `.env`'s value. `TEST_REDIS_URL` points at Redis database `/15`, and `assertTestRedis` refuses any other pathname — two layers, like `_test` DB names.
- **Hashing an email before it becomes a Redis key is the only way to keep `MONITOR`/`KEYS` from leaking user data.** `emailKey` now returns `email:<32-hex>`, not `email:user@example.com`. Same email → same digest (same budget), different case → same digest (lowercase before hashing), but the raw address never appears in Redis. The integration test asserts `rl:login-account:` exists and no `@` or email string appears in any key.
- **Redis keys are visible to anyone who can `MONITOR` or `KEYS`.** A shared Redis instance is *not* a place for user data. The store's own tests and the rate-limit "Redis specifics" test enforce this — a future change that puts an email or a token in a key fails the test, not just review.
- **A single Redis instance serves two different kinds of data, and the eviction policy matters.** `noeviction` today, because Week 6 will add BullMQ jobs (which cannot be silently evicted). A cache would prefer `allkeys-lru`. Both in one instance means the wrong policy for one of them — a reason to run separate instances later. The `--appendonly yes` line preserves data across restarts, but a crash without AOF configured would lose recent writes.
- **`127.0.0.1:6379:6379` is not the same as `6379:6379`.** The first binds to localhost only; the second publishes the port on **every** network interface, which on a café Wi-Fi exposes an unauthenticated Redis to the whole network. The same fix was applied to PostgreSQL's port in the same commit — an incidental but important hardening from Day 3.

### Week 6 (Day 37 — Caching with Cache-Aside)
- **Cache-aside (lazy loading): the application owns the logic.** Read the cache, return on hit, compute and `SET` on miss with a TTL. The cache is not the source of truth; it is a shortcut for a query whose answer is expensive and tolerant of a small amount of staleness. If the uncached query is 2 ms, the cache is not worth its complexity.
- **The key must contain every input the answer depends on.** Here: the project, and the UTC date (overdue changes at midnight). Leave the date out and a cached "due soon" answer from yesterday is wrong today. Include the viewer only if the answer actually depends on who is asking; the shared-per-project answer is safe *because* the access check runs before the cache.
- **Authorization before the cache, always.** The cache stores *answers*, not *permissions*. If the check ran after a cache hit, a stranger would receive a member's dashboard. This is a data leak that no later check can undo. `getProjectStats` calls `access.requireProjectRole(actor, projectId, "member")` as its first statement; the unit test asserts `cache.getOrCompute` and `tasks.projectStats` are never called for a stranger.
- **Invalidation by generation counter, not by pattern delete.** `cache:ver:<namespace>:<scope>` is an `INCR`-able integer; the data key contains it. A write does `INCR` on the version key, and every entry under the old generation becomes unreachable (and eventually expires). No `KEYS`, no `SCAN`, no `DEL`. The version key itself has a long TTL (a day) so a project that is never read again doesn't leak a counter forever.
- **The stale-write race, and why generations fix it.** Reader misses → reads generation `g` → computes from a database snapshot → writer commits → writer `INCR`s to `g+1` → reader stores under `g`. Nobody reads `g` again. **Rule: read the version first, compute second, invalidate after the write has committed.** If the invalidation ran before the commit, a reader could compute from old data and store it under the new generation — which is the design that *is* wrong.
- **Invalidate after commit, for every project a write touches.** A move changes two projects; a merge changes the target and the source; a create, an update, a delete, a duplicate each change one. The invalidation helper takes a `Set` of ids and skips `undefined`, so a route that conditionally touches 0, 1 or 2 projects is correct by construction.
- **The TTL is the safety net, not the mechanism.** Normal invalidation should keep the cache fresh; the TTL bounds how stale an entry can be if an invalidation is missed (a write that bypasses the service layer, a Redis outage during the `INCR`). 60 s ±10% is a choice based on "how stale may a dashboard be?", not "how long can I cache?". The jitter spreads expirations so a thousand keys don't all die at once.
- **Single-flight is per process.** Concurrent misses for the same key share one computation. That prevents a stampede *within* one instance. Across instances, each has its own `inFlight` map, so N instances each compute once — the cross-instance lock is a challenge. Jittered TTLs are what reduce the *coincidence* of expirations between instances.
- **A cache must never break the feature.** Redis down, Redis slow, Redis returning garbage: the request is answered from `compute()` and marked `bypass`. A write must never fail because invalidation failed — the TTL bounds the staleness. The `warn` is throttled to once every 30 s so an outage doesn't flood stdout.
- **Entries need a shape and a version.** `schema.safeParse` on read treats an unreadable or old-shaped entry as a miss. `KEY_FORMAT = "v1"` in the key means a shape change bumps the version and old entries are simply never read; no migration, no cleanup.
- **IDs collide when the database is reset.** `TRUNCATE ... RESTART IDENTITY` makes project 1 a *different* project, but the cache key is the same. Every test, `db:fresh`, and backup restore must flush the cache too. The fix is a one-line `flushTestRedis()` in `tests/support/setup.ts`'s `beforeEach`; without it, tests fail in confusing ways because one test's cached answer is served as a hit to the next test's different project 1.
- **Don't put anything sensitive in the cache.** `projectStats` returns aggregate numbers only, never titles, names, or email addresses. A test iterates the `cache:v1:*` keys and asserts (a) the key matches `cache:v1:project-stats:project:\d+:\d+:\d{4}-\d{2}-\d{2}`, (b) the JSON body has exactly the eight stats fields, and (c) none of the fixture's titles or user names or email addresses appears anywhere in Redis.
- **HTTP caching headers.** The response is personalised by login, so `Cache-Control: private, no-cache` prevents shared proxies from storing it. `X-Cache: hit | miss | bypass` is a debugging aid and a test hook: a test can assert `hit` on the second request and `miss` on the first without reaching into Redis.
- **Invalidation is a service-layer concern, not a route concern.** `tasks.service.ts` and `projects.service.ts` call `stats.invalidateProject(...)` after their writes have committed, so the CLI (which goes through the same services) invalidates too. A route that wrote directly would not — which is why the layering rule (no Prisma in controllers) matters for correctness, not just style.

### Week 6 (Day 38 — Background Jobs with BullMQ & Assignment Emails)
- **Why a queue.** A request should answer in milliseconds. An email takes hundreds of milliseconds when SMTP is healthy and seconds (or never) when it isn't. A queue lets the API **record the intention** ("tell Alex about task 7") and return, while a separate **worker** does the slow, fallible part, retries it, and survives restarts.
- **The parts.** The **producer** (the API) adds jobs. **Redis** holds them (waiting, active, delayed, completed, failed). The **worker** is a separate process that takes jobs, runs a handler, and acknowledges them.
- **At-least-once delivery.** A queue can promise a job is never *lost*, but not that it runs *exactly once*. If a worker crashes after sending the email but before telling Redis, the job runs again and Alex gets two emails. So **handlers must tolerate being run twice**. Ours decides from the *current* database state ("is this task still assigned to this person?"), not from what the payload claims, and a rare duplicate email is accepted. For something like charging a card, you would need a stored idempotency key.
- **Payloads carry ids, not data.** `{ taskId, assigneeId, assignedById }`, never the title or an email address. Between enqueue and processing the task can be renamed, reassigned, or deleted, and the worker must read the truth *then*. It also keeps personal data out of Redis.
- **Retries.** `attempts: 5` counts the first run too. **Exponential backoff** waits 5 s, 10 s, 20 s, 40 s so a recovering SMTP server isn't hammered. Not every failure deserves a retry: a malformed payload or a mailbox that doesn't exist fails the same way every time. Throw `UnrecoverableError` so the job fails immediately instead of wasting attempts.
- **The dead-letter list.** BullMQ keeps jobs that ran out of attempts in the **failed** set. We keep them for seven days (bounded, because Redis can't evict) so a person can inspect and retry them.
- **The dual-write problem.** "Save the assignment in PostgreSQL" and "put a job in Redis" are two writes to two systems, and there's no transaction across them. Enqueue before the commit and you may email about something that was rolled back. Enqueue after the commit (what we do, as with cache invalidation) and a Redis outage at that moment **loses the notification**. The proper cure is a **transactional outbox**: write the "to notify" row in the same PostgreSQL transaction, and a relay moves it to the queue. That's a challenge today. For now, enqueue failures are logged and never fail the user's request.
- **Worker lifecycle.** A deploy sends `SIGTERM`. A graceful worker stops taking new jobs, **lets the active job finish**, then exits. A worker that is killed outright leaves its job *stalled*; BullMQ notices after the lock expires (30 s) and gives it to another worker, which is one more way to get a duplicate run.
- **Redis connection rules.** Workers need `maxRetriesPerRequest: null` (they block waiting for jobs). Producers want the opposite: fail fast. Queue names can't contain `:`. BullMQ needs `noeviction`, or Redis may silently delete jobs.
- **Email safety.** Never send to an address the *requester* supplied (we only email the assignee, a project member). Send plain text, so user-written titles can't inject HTML. Collapse newlines in anything that goes into a header, or a title like `x\r\nBcc: evil@example.com` becomes an extra recipient. Log no addresses or bodies.
- **Mailpit** is an SMTP server that accepts every message and shows it in a web page, so development never sends a real email. Its ports are bound to localhost, because a catch-all mail server on every interface is an open door.
- **Three modes.** `queue` (production behaviour), `inline` (run the handler immediately, used by tests and handy without a worker; failures are logged and never fail the request) and `off`.

## Checkpoint answers (Days 2–6)

*(Skipped or filled in as you go)*

### Day 6 — Git workflow
1. Difference between `git revert` and `git reset --hard`? Which is safe on a shared branch?
   > `git reset --hard` moves the branch pointer backward, deleting commits — it rewrites history and breaks anyone who already pulled. `git revert` adds a new commit that cancels an old one, leaving history intact. **`git revert` is safe on shared branches.**
2. Why squash-merge PRs instead of keeping every small commit on `main`?
   > Feature branches accumulate messy WIP commits. Squash-merging combines them into one logical commit, so `main` reads as one clean commit per feature — easier to review, bisect, and revert.
3. What do the three conflict markers mean?
   > `<<<<<<< HEAD` starts your current branch's version; `=======` separates the two versions; `>>>>>>> branch-name` ends the incoming branch's version. You pick what to keep and delete all three lines.
4. Why write `Closes #1` in the PR description?
   > It's a GitHub closing keyword. When the PR merges, GitHub auto-closes the linked issue and adds a reference. Keeps issues and PRs in sync without manual bookkeeping.

## Day 9 Checkpoint Answers
1. Why return 201 and a Location header from POST?
   > 201 Created signals "a new resource exists." The Location header points at the new resource's URL so clients don't have to guess the ID.
2. Why does .strict() matter for security and DX?
   > Security: without it, a client could send extra fields like `{ role: "admin" }` (mass assignment). DX: typos like `{ prioritiy: "high" }` fail loudly instead of being silently ignored.
3. Why is DELETE idempotent even though the 2nd call returns 404?
   > Idempotent means the end state is the same. After the first DELETE, the task is gone. After the second, it's still gone. The 404 just reports "already gone."
4. Why is malformed JSON a 400, not a 500?
   > 500 means the server has a bug. Malformed JSON is a client mistake. The server didn't malfunction; it correctly refused bad input.
5. Explain the lost-update bug and how a DB fixes it.
   > 8 parallel requests read-modify-write the same file. The last write overwrote the others. A database fixes this with transactions and row locks, making the operation atomic.

## Day 11 Checkpoint Answers
1. What does "services depend on an interface, not an implementation" mean?
   > The service imports the `Repository<T>` interface, not the `JsonFileRepository` class. This allows swapping JSON for PostgreSQL without touching business logic.
2. Why is `container.ts` the only file allowed to say `new JsonFileRepository(...)`?
   > It acts as the composition root. Swapping implementations (or using a fake for testing) happens in one place.
3. Why does the write queue fix concurrent requests in one process but not across processes?
   > The queue chains promises in memory. If you run a second Node process (or the CLI), it has its own queue and will still race on the file.
4. When is a bad `projectId` a `400`, a missing `/projects/99` a `404`, and deleting a project with tasks a `409`?
   > **400**: Body has invalid data. **404**: URL resource not found. **409**: Request is valid but conflicts with current state (can't delete a non-empty project).
5. Why is the check-then-delete in `deleteProject` still unsafe?
   > Between checking for tasks and deleting the project, another request could add a task. A DB fixes this with a foreign key constraint.

## Day 12 Checkpoint Answers
1. Why can `curl` call your API from anywhere while a browser page from another origin can't? Does CORS protect your data from attackers?
   > CORS is a browser security feature. `curl` ignores CORS headers entirely. CORS does *not* protect your data from attackers (like someone using `curl` or Postman); it only prevents malicious websites from making requests on behalf of a user's browser. It is not authentication.
2. What is a preflight request, and which requests trigger it?
   > A preflight is an `OPTIONS` request the browser sends before the actual request to check if the server allows it. Requests that trigger it are non-simple requests: those using methods like `PUT`, `PATCH`, `DELETE`, or those with custom headers like `Content-Type: application/json`.
3. Why does `GET /tasks/2/comments/2` return `404` when comment 2 exists on task 1?
   > To prevent IDOR (Insecure Direct Object Reference). If we just looked up the comment by its ID, a user could read comments from other tasks by guessing IDs. We explicitly check that the comment's `taskId` matches the `taskId` in the URL.
4. Why do Helmet and CORS come before the router, while `errorHandler` comes last?
   > Helmet and CORS must run first so that *every* response (including errors and preflights) gets the security headers. `errorHandler` must be last so it catches errors thrown by any route or middleware before it.
5. Why accept a client-supplied `X-Request-Id` only if it matches a strict pattern?
   > To prevent log injection attacks. If we accepted arbitrary strings, an attacker could send newlines or fake JSON to corrupt our logs. A strict regex ensures only safe, predictable IDs are used.
6. When would you choose cascade delete, and when would you choose to block with `409`?
   > Cascade delete when the child resource is meaningless without the parent (e.g., a comment cannot exist without a task). Block with `409` when the child is an independent entity (e.g., a task is still valuable even if its project is deleted).

## Day 13 Checkpoint Answers
1. Why generate request-body schemas from Zod instead of writing them by hand in the spec?
   > Drift. If you write them by hand, the API docs will eventually disagree with the actual validation logic. Generating them from Zod means the docs are guaranteed to match the code.
2. Which parts of the spec can still drift from the code?
   > The paths, status codes, and query parameters. Those are written by hand in `openapi.ts` and aren't generated by Zod.
3. Why do `/docs` and `/openapi.json` come before Helmet in `app.ts`?
   > Swagger UI loads assets (scripts, CSS) that violate Helmet's default Content Security Policy (CSP). Mounting Swagger first allows it to bypass Helmet so the UI renders correctly.
4. What can a smoke test catch that a type-check can't? What can it not catch?
   > A type-check only verifies syntax and types. A smoke test actually hits the running server, verifying HTTP status codes, response shapes, database writes, and middleware behavior. It cannot catch internal logic errors that still return a 200 (e.g., calculating a total incorrectly).
5. Why does it matter that every error, including a 404 for an unknown route and a 400 for malformed JSON, has the same shape?
   > It allows frontend clients to write one error-handling function for all API calls, instead of custom logic for every endpoint.

## Day 15 Checkpoint Answers
1. What problem does a migration file solve compared with editing the database by hand?
   > It creates a version history for the database. If a teammate clones the repo, they can run `prisma migrate dev` and their database will instantly match yours perfectly. If you edit by hand, you have to remember every SQL command you typed.
2. Which of your Day 11 and 12 service checks are now handled by the schema, and by which keyword?
   > The "project has tasks" check is now handled by `onDelete: Restrict` on the Task project relation. The comment cascade delete is handled by `onDelete: Cascade`. The "project exists" check is handled by the foreign key `REFERENCES`.
3. Why is `ProjectMember` an explicit model instead of a hidden relation?
   > Because it has its own data (the `role` and `joinedAt`). An implicit many-to-many relation only stores the two IDs. We need to know if a user is an `owner` or a `member`.
4. Why do we index foreign keys such as `projectId`?
   > Without an index, the database has to scan the entire tasks table row-by-row every time you query `WHERE projectId = 1`. An index makes that lookup instant.
5. Why is the generated client in `.gitignore` while `prisma/migrations` is committed?
   > The generated client is just code automatically built from the schema. You never edit it manually. The migrations, however, are hand-crafted history that must be shared with the team and deployed to production.
6. Why should the app create one `PrismaClient` and not one per request?
   > Every new `PrismaClient` creates a new connection pool to the database. If you create one per request, you will exhaust the database's maximum connections very quickly and crash.

## Day 16 Checkpoint Answers
1. Which three things had to be translated at the repository boundary, and why do the services never see Prisma types?
   > Dates (`Date` objects to ISO strings), missing values (`undefined` to `null`), and the database's `P2025` error (to `undefined` so the service can throw a 404). The service only knows about our domain types because the repository mapper handles the translation.
2. In Prisma, what's the difference between `undefined` and `null` in an update, and how does the mapper handle it?
   > `undefined` means "don't touch this column". `null` means "set this column to NULL". Our mapper checks if the key exists (`"dueDate" in d`) to know if the user actually wanted to clear it.
3. Why does the CLI hang without `prisma.$disconnect()`?
   > Prisma maintains an open connection pool to the database. Node.js won't exit as long as there are active connections, so the CLI waits forever unless we explicitly disconnect.
4. Why must the sequences be moved after importing rows with explicit IDs?
   > PostgreSQL's `SERIAL` sequence only counts up. If you import 100 tasks with IDs 1-100, the sequence is still at 1. The next insert will try to use ID 1 and crash. We have to manually tell the sequence to start at 101.
5. Why did the 8 parallel creates all survive this time, and why does it also work across processes?
   > PostgreSQL handles concurrent writes safely with transactions and row locks. The database arbitrates the race condition, not our application code.
6. Why is `GET /tasks` still inefficient even though it now uses a database?
   > Because `queryTasks` still loads *all* rows into memory using `findMany()` and then slices them in JavaScript. It doesn't use SQL `LIMIT` and `OFFSET` yet. Day 18 fixes this.

## Day 17 Checkpoint Answers
1. Why is "check that it exists, then insert" unsafe, while a foreign key is safe?
   > `check, then insert` has a gap between the two steps where another request can slip in (race condition). A foreign key is checked *inside the write operation* by the database, so there is no gap and no code path can bypass it.
2. The same `P2003` code becomes a `400` on insert and a `409` on delete. Why?
   > On insert, a bad reference means the client sent a bad `projectId` (their fault: 400). On delete, a `P2003` means the resource is still in use by other rows (a state conflict: 409). The repository maps these to `InvalidReferenceError` and `InUseError` so the service can add the human message.
3. Which checks did you deliberately keep in the services, and why can't the database do them?
   > We kept the comment ownership check (`comment.taskId === taskId`). The database enforces that the comment belongs to *a* task, but it doesn't know that the URL requested `/tasks/2/comments/2` instead of `/tasks/1/comments/2`. That is a business rule (preventing IDOR).
4. What is the N+1 problem, and how many operations did each version in `n-plus-one.ts` take?
   > N+1 happens when you run 1 query for a list, and then N extra queries inside a loop. The naive version took 21 operations for 20 projects. The `_count` version took 1 operation.
5. Why can't an in-memory fake repository test your integrity rules?
   > An in-memory array doesn't have foreign keys. It wouldn't throw a `P2003` error. To test integrity, you must run your tests against a real database (like a test instance of Postgres).

## Day 18 Checkpoint Answers
1. **Which part of the old `applyQuery` became `WHERE`, which became `ORDER BY`, and which became `LIMIT/OFFSET`?**
   > `filter` became `WHERE`, `sort` became `ORDER BY`, and `slice` became `LIMIT` and `OFFSET`.
2. **Why must `count` use exactly the same `WHERE` as the page query, and why are they run in one transaction?**
   > If the `WHERE` differs, the pagination metadata won't match the data. The transaction ensures that a row isn't inserted or deleted between the page query and the count query, which would result in a mismatched total.
3. **What did the `id` tie-breaker protect you from?**
   > It guarantees a stable sort order. If 50 tasks have `priority: high`, without the `id` tie-breaker, Postgres might return them in a different order on page 1 vs page 2, causing items to be duplicated or skipped. (We proved this: the smoke test failed when we removed it!)
4. **What does an index cost, and why did we index `(status, due_date, id)` rather than three separate indexes?**
   > An index costs disk space and slows down inserts/updates. A composite index matches the exact query shape (`WHERE status = X ORDER BY due_date, id`), allowing the database to jump directly to the right rows in the right order without extra sorting.
5. **Why is `OFFSET 49980` slow even with an index, and how does keyset pagination avoid that?**
   > `OFFSET` still forces the database to walk past all 49,980 rows before returning data. Keyset pagination uses `WHERE id > 49980` (which jumps straight to the spot via the index).
6. **Why can't a normal index speed up `ILIKE '%text%'`?**
   > A standard index is sorted from left to right. A leading wildcard (`%text`) means the database has no starting point to search from, forcing it to scan every row.

## Day 19 Checkpoint Answers
1. **Which of today's operations needed an explicit transaction, and why didn't `updateMany` alone?**
   > `duplicateProject` needed one because it inserts a project and then many tasks (multiple statements). `mergeProjects` needed one because it moves tasks *and* deletes the source project. A single `updateMany` is atomic by itself, but separate statements are not.
2. **What happens if you call `prisma.x` instead of `tx.x` inside an interactive transaction?**
   > That specific query runs *outside* the transaction. If the transaction rolls back later, the changes made by `prisma.x` are not rolled back. We saw this in the demo when `prisma.task.create` left a stray task.
3. **Why does `mergeProjects` still check that the target exists, when a foreign key exists?**
   > Because moving *zero* tasks means the database never evaluates the foreign key on the target. If the target doesn't exist, the merge would succeed (moving nothing) and delete the source, leaving an empty invalid state.
4. **What's a deadlock, how did you create one, and what two strategies avoid or handle it?**
   > A deadlock happens when two transactions wait for locks held by each other. (We created one by updating row X then Y in one terminal, and Y then X in another). Strategies: 1) Retry the transaction (`P2034`), 2) Lock rows in a consistent order (`ORDER BY id`).
5. **Why should you never send an email or call an external API inside a transaction?**
   > The transaction holds a database connection and locks. If the external API is slow or fails, the transaction stays open longer, blocking other requests and risking timeouts.
6. **What does the `UnitOfWork` interface buy you?**
   > It hides Prisma's `$transaction` from the service layer. Services just say "run these operations atomically" without importing or knowing about Prisma, making them easier to test and swap.

## Day 20 Checkpoint Answers
1. **What's the difference between `migrate dev` and `migrate deploy`, and why must production only ever use the second?**
   > `migrate dev` generates new migrations from schema changes, and it may offer to reset the database. `migrate deploy` only applies pending migrations and never resets. Production must use `deploy` because resetting would delete real user data.
2. **Why does Prisma generate `DROP` + `ADD` for a rename, and how did you turn it into a rename?**
   > Prisma only sees the before and after schema; it can't know that `body` and `content` are the same data. We used `--create-only` to generate the SQL, then hand-edited it to use `RENAME COLUMN`.
3. **Why can't you add a `NOT NULL` column without a default to a table with rows, and what are the three steps that fix it?**
   > Because existing rows would have no value for the new column. The three steps are: 1) add the column as nullable, 2) backfill existing rows with a value, 3) set the column to `NOT NULL` and add the unique index.
4. **Why must you never edit a migration that has already been applied?**
   > Prisma stores a checksum of the migration file in `_prisma_migrations`. If you change the file, the checksum no longer matches, and Prisma will block all future migrations until you reset the database.
5. **What makes a seed script idempotent?**
   > It uses `upsert` (or checks for existence) instead of `create`, so running it twice produces the same state without crashing or duplicating data.
6. **What two different kinds of mistakes does `npm run db:check-migrations` catch?**
   > 1) Migrations that fail to apply to an empty database (e.g., syntax errors). 2) A schema that has drifted from the migrations (e.g., you edited `schema.prisma` but forgot to run `migrate dev`).

## Day 22 Checkpoint Answers
1. **Why is Argon2id better than SHA-256 for passwords, even though SHA-256 is "more secure" as a general hash?**
   > Argon2id is deliberately slow and memory-hungry. SHA-256 is fast (billions of hashes per second on a GPU). For passwords, "slow" is a feature — it makes brute-force attacks impractical.
2. **What's inside a stored Argon2 hash, and why can you raise the cost settings later without breaking old users?**
   > The hash string contains the algorithm, version, cost settings (`m`, `t`, `p`), salt, and hash. When verifying, Argon2 reads the settings from the string, so old hashes still verify even after you raise the cost for new ones.
3. **Why did eight parallel registrations produce exactly one `201`, and why is that better than checking `findByEmail` first?**
   > The database's unique constraint on `email` is atomic. Eight parallel inserts race, but only one wins. A `findByEmail` check would have a race condition (two requests could both see "not found" and both try to insert).
4. **Why is `passwordHash` missing from the `User` type, and what does that protect you from?**
   > It's a safety feature. The TypeScript compiler will refuse to compile any code that tries to return `passwordHash` from a function typed as `User`.
5. **Why do we lowercase and trim emails but never touch passwords?**
   > Emails are identifiers, so normalization is required (`Sam@Example.com` and `sam@example.com` must be the same account). Passwords are secrets — even trimming a space could break a user's login.
6. **What does a `409` on registration reveal, and why will login need to be more careful?**
   > A `409` on registration reveals that an email is already registered (user enumeration). For login, we'll always return `401 "Invalid email or password"` without specifying which one was wrong, to prevent attackers from discovering valid emails.
7. **Why can lots of simultaneous hashing hurt a server even though Argon2 doesn't block the event loop?**
   > Argon2 uses libuv's thread pool (default: 4 threads). A flood of hashes queues up, consuming CPU and memory. This is why rate limiting is needed (Day 27).

## Day 23 Checkpoint Answers
1. **A JWT payload is readable by anyone. Then why can't an attacker change `sub` to `1`?**
   > Because the signature is computed over the header and payload. Changing `sub` invalidates the signature, and `jwtVerify` rejects the token.
2. **What attack does `algorithms: ["HS256"]` prevent, and what would trusting the token's own `alg` header allow?**
   > It prevents the `alg: none` attack (where an attacker crafts a token with no signature) and algorithm confusion (switching between HS256 and RS256). Trusting the `alg` header would allow an attacker to pick an algorithm that bypasses the signature check.
3. **Why does the token contain only the user id and not the user's role or project memberships?**
   > Because roles and memberships can change. A token that says "user is admin" would still grant admin access after the user is demoted, until the token expires. Looking up the roles from the database on each request keeps them fresh.
4. **Why does `authenticate` look the user up even though the signature is valid?**
   > A valid signature means the token was issued by us, but the user might have been deleted since then. Looking them up in the database ensures the account still exists.
5. **Name two different ways a login endpoint can reveal that an email exists, and how you closed each one.**
   > 1) Different error messages ("User not found" vs "Wrong password") — closed by using the same message. 2) Different response times (fast for unknown email, slow for real email because of hashing) — closed by always running a hash against a dummy value for unknown users.
6. **Why must `Authorization` be in the CORS `allowedHeaders`, and why did `curl` never show that problem?**
   > CORS is enforced by browsers, not by `curl`. Without it, the browser's preflight request would be rejected, and any request with a token would fail. `curl` ignores CORS headers entirely.
7. **Why is a 15-minute expiry a security feature, and what problem does it create that refresh tokens solve?**
   > A short expiry limits the damage if a token leaks. The problem is the user has to log in again every 15 minutes, which is annoying. Refresh tokens (Day 25) allow the user to get a new access token without re-entering their password.

## Day 24 Checkpoint Answers
1. **When is a failed request a `401`, a `403` and a `404`?**
   > `401`: No credentials or invalid token. `403`: Valid token, but you aren't the creator (or don't have permission). `404`: The resource doesn't exist at all (including when we want to hide its existence).
2. **What is Broken Object Level Authorization, and which line of your code is the defense?**
   > BOLA (IDOR) is when an endpoint checks you're logged in but not that *the specific object* is yours. The defense is the `assertOwner(actor, task.createdById)` call in the service.
3. **Why does the policy live in a function that services call, instead of in the routes?**
   > If the check is in the route, a new route or a CLI call might forget it. Putting it in the service ensures every code path goes through the same rule.
4. **Why does `authenticate` run before `validate`, and what would an attacker learn if the order were reversed?**
   > `authenticate` runs before `validate` so an unauthenticated caller gets `401` before learning anything about the request body. If `validate` ran first, they'd see `400` errors and learn the schema (useful for fuzzing).
5. **Why can the `Actor` argument not be forgotten (compile error), and what kind of mistake can it still not catch?**
   > The compiler enforces that every service call provides an `Actor` argument. But it can't check that you passed the *right* actor (e.g., passing `SYSTEM` in an HTTP controller would compile but be wrong).
6. **What does `scripts/auth-coverage.ts` guard against?**
   > It iterates through every documented route and asserts that it returns `401` without a token (unless it's marked public). This catches a new route added without the `authenticate` middleware.
7. **Why do legacy rows with no owner become read-only?**
   > `assertOwner` rejects any user (except `SYSTEM`) from modifying a resource with `createdById: undefined`. This is safe because we don't know who should have permission.

## Day 25 Checkpoint Answers
1. **Why does the refresh token live in your database while the access token doesn't?**
   > The access token must be short-lived (15 min) because it can't be revoked. The refresh token must be revocable (logout, theft detection), which requires server-side state.
2. **Why is SHA-256 fine for refresh tokens but wrong for passwords? Use the numbers from Experiment A.**
   > A refresh token is 256 random bits (unguessable). Even at 10 billion guesses/second, exhausting 256 bits takes longer than the age of the universe. A password is low-entropy; a fast hash lets an attacker brute-force it quickly. Argon2 must be slow to make that infeasible.
3. **What does rotation protect against, and what does reuse detection add on top?**
   > Rotation ensures each refresh token works only once (a stolen token is useless after the real user uses it). Reuse detection catches the thief: if a used token is replayed, the whole family is revoked, logging out both the thief and the real user.
4. **Why does `markUsed` use `UPDATE ... WHERE used_at IS NULL` and check the row count?**
   > It's an atomic compare-and-swap. Of 10 parallel refreshes with the same token, only one gets `count === 1`. A read-then-write would let multiple win (we proved this: the test failed with the broken version).
5. **Why is logout always `204`, even for an unknown token?**
   > To prevent user enumeration. If we returned `404` for an unknown token, an attacker could distinguish "valid" from "invalid" tokens. `204` means "the token is dead, whatever it was."
6. **Why must expired rows be kept until they expire, and what would break if the purge deleted used rows early?**
   > Reuse detection looks up the old token by hash. If the row was deleted, the reuse looks like a "new" token and wouldn't revoke the family. Expired rows must stay until they can no longer be replayed.
7. **What can a thief still do with a stolen access token after the owner logs out, and how long?**
   > The access token remains valid until its 15-minute expiry, even after logout. The thief can make API calls during that window. This is the cost of stateless tokens, and the reason to keep them short.

## Day 26 Checkpoint Answers
1. **When does a request get `404`, and when `403`, in TaskFlow? Why did Day 24's `403`s on strangers become `404`s?**
   > `404` for strangers (they can't see the project exists). `403` for members who lack the required role (e.g., a member trying to rename a project). Day 24's `403`s became `404`s because today we hide a project's existence from strangers entirely.
2. **Why are roles looked up in the database on every request instead of stored in the JWT?**
   > Because roles change. If a user is removed from a project, a token that says "user is a member" would still grant access until the token expires (15 min). Looking up the role from the database on every request keeps it fresh.
3. **Why must the visibility filter be part of the `WHERE` (and the `count`) instead of removing hidden rows afterwards?**
   > If you filter after the database query, `meta.total` would include hidden rows (leaking counts) and pagination would skip rows (returning fewer results than expected). The `WHERE` must filter before both the page query and the count.
4. **Why does `addComment` ignore any author the client sends, and why do we still store the name next to `authorId`?**
   > The author comes from the token (`actor.id`), not the body. Storing the name is a snapshot for display. If the user is later deleted (or renamed), old comments still show the original name. The `authorId` is the real link for permissions.
5. **Explain the last-owner race: what does each request see, and what does `FOR UPDATE` change?**
   > Without `FOR UPDATE`, two owners can demote each other at the same time. Both requests see 2 owners, both check "is this the last owner?" → false, both succeed → 0 owners. `FOR UPDATE` locks the project row, so the second request waits until the first finishes, then re-checks and sees only 1 owner → rejects the demotion.
6. **Why does `changeRole` check the caller's role twice, once before and once after taking the lock?**
   > The first check is cheap (no lock) and rejects strangers/members early. The second check is after the lock: another transaction may have changed the caller's role while waiting for the lock. Without the second check, a demoted owner could still act as an owner.
7. **What does "add member by email" reveal to an owner, and how will rate limiting (tomorrow) and invitations (challenge 2) limit it?**
   > It reveals whether an email has an account ("No user with that email" vs "Added"). Rate limiting (Day 27) makes probing slow. Invitations (challenge 2) would remove the endpoint entirely, so the server never confirms whether an email is registered.
8. **Which cells of your prediction table did you get wrong, and what does that tell you about how your intuition and your code disagree?**
   > (Write your own answer from the experiment.)

## Day 27 Checkpoint Answers
1. **Why does the limiter sit after CORS but before the body parser?**
   > After CORS so a `429` still carries the CORS headers the browser needs to read it. Before the body parser so attackers can't make you parse huge bodies for free (the limiter runs before the expensive operation).
2. **Which three keys did you use, and what attack does each one stop?**
   > **IP:** stops a single machine spraying many accounts or flooding any route. **Account (email):** stops one attacker from guessing a single victim's password, even from many IPs. **User ID:** stops an authenticated user from hammering a sensitive flow (like member invites) too fast.
3. **What can an attacker do to a victim when you throttle per account, and what would you change to reduce that?**
   > An attacker can lock the victim out by sending wrong passwords until the account is throttled (`429`). To reduce this, we could use a shorter window, or add a challenge (CAPTCHA) instead of a hard block, or only throttle failures after a successful login attempt.
4. **Explain both `trust proxy` mistakes: what happens with 0 hops behind a real proxy, and with 1 hop and no proxy at all?**
   > **0 hops behind a proxy:** the app sees every request as coming from the proxy's IP, so per-IP limits become one global limit (false blocks). **1 hop with no proxy:** the app trusts the `X-Forwarded-For` header, so an attacker can forge it and get a fresh limit for each fake IP (complete bypass).
5. **Why must a custom key function that falls back to an IP use `ipKeyGenerator`?**
   > IPv6 clients often control a whole `/64` block of addresses. Without `ipKeyGenerator`, they could rotate through millions of IPs and bypass the limit. `ipKeyGenerator` groups addresses by subnet.
6. **Why `skipSuccessfulRequests` for logins but not for registrations?**
   > A successful login means the user entered the correct password, so it's not an attack. A successful registration always costs an Argon2 hash, so it must count even when it succeeds (to prevent someone spamming registrations).
7. **Which inputs made the server return `500` before today's fixes, and why is a `500` on bad input a security problem and not just an annoyance?**
   > Out-of-range integers (larger than 2,147,483,647) and NUL characters (`\u0000`). A `500` leaks that the input reached the database and crashed it — an attacker can use that to map your schema or trigger expensive queries. A `400` is safe and explicit.
8. **What would stop working if you ran two server instances behind a load balancer with the current in-memory counters?**
   > The counters are per-process. Two instances each have their own budget, so an attacker can double their attempts by spreading them across instances. Week 6 moves the counters to Redis so all instances share them.

## Day 29 Checkpoint Answers
1. **Why did we use a fake for member roles but a spy for `process.exit`? Which would you rather maintain after a refactor?**
   > A fake (`fakeMembers({ "10:1": "owner" })`) implements the real `MemberRepository` interface, so it survives refactors: if the interface changes, TypeScript tells us to update the fake. A spy (`vi.spyOn(process, "exit")`) is bound to the *implementation* — if we rename `process.exit`, the spy silently stops working. The fake is easier to maintain.
2. **Why does `vitest.config.ts` set every environment variable, and what silent bug does that prevent?**
   > Without it, `config.ts` reads the developer's local `.env`. A test that passes only because *your* `.env` has the right values would fail on CI where `.env` doesn't exist. The config sets every variable up front, so every test runs under the same controlled environment.
3. **Why fake only `Date` and not all timers in the token tests?**
   > Faking all timers also freezes `setTimeout` and async timer-based code (like `argon2` or `jose` crypto operations that may use timers internally). Faking only `Date` gives us control over token expiry without breaking async code.
4. **Why is `restoreMocks: true` useful, and what goes wrong in test #5 if a spy leaks into test #6?**
   > `restoreMocks: true` resets every `vi.spyOn` before each test, so a spy from test #5 doesn't affect test #6. Without it, a spy that mocked `logger.error` would keep intercepting calls in later tests, hiding a real error.
5. **What did the failing `slugify` test teach you about writing the test before trusting the code?**
   > The original `slugify` sliced to 50 characters *after* trimming dashes, so a cut could leave a trailing `-`. Without a test, this would have shipped. The test found it in seconds. Writing the test before trusting the code caught a real edge case that no one would have noticed manually.
6. **Which mutation in the table was not caught at first, and what test did you add?**
   > Row 4 (removing `algorithms: ["HS256"]`) was not caught by the first version of the tests because `jose` protects against HS512 by default. I added a test that explicitly checks the allowed algorithm by attempting to verify with a token signed using `HS512`.
7. **Why is it correct that controllers and repositories show 0% coverage after today?**
   > Their logic depends on a database. Unit tests can't verify Prisma queries meaningfully (mocking Prisma proves nothing). Their real bugs only appear when the real database runs the query — that's what Day 30's integration tests are for.

## Day 30 Checkpoint Answers
1. **Why don't we mock Prisma in integration tests, and which kinds of bugs does a real database catch that a mock never would?**
   > A mocked Prisma returns whatever you tell it to, so the test proves nothing about your SQL. A real database catches: a wrong column name, a missing migration, a foreign key that doesn't behave as assumed, a unique constraint that rejects the wrong input, and middleware in the wrong order (e.g., `validate` before `authenticate`). These are exactly the bugs that reach production.
2. **Why does the suite run with `fileParallelism: false`? What did you observe when it was `true`?**
   > Because all files share one test database. If two files truncate the same tables in parallel, one wipes the other's data mid-test, producing intermittent failures (`expected 1 to be 0` or a user that vanished). Not deterministic — the intermittency *is* the problem. Set it back to `false` and re-run; the failures disappear.
3. **What are the two layers of protection against wiping the wrong database, and why is the second one needed after the first?**
   > Layer 1 (`globalSetup.ts`): refuses any URL whose database name doesn't match `/^[a-z0-9_]+_test$/`. Catches "I pointed `TEST_DATABASE_URL` at the wrong thing" *before* anything runs. Layer 2 (`truncateAll()`): runs `SELECT current_database()` and refuses if the result doesn't end in `_test`. Catches "the URL says `_test` but the client is actually connected elsewhere" — a URL-vs-reality mismatch that layer 1 can't see (e.g., a `dotenv` loading order bug, or an env change mid-flight). Only layer 2 notices.
4. **Why does the global setup run `prisma migrate deploy` instead of `prisma db push`, or reusing whatever state the database is in?**
   > `migrate deploy` applies every migration in order, so the tests also prove the migration history works from an empty database. `db push` skips the migration files entirely (it derives the schema from `schema.prisma`), so it wouldn't prove migrations are reproducible. Reusing the DB's existing state can leave a half-applied migration that looks green — exactly the failure mode the whole migration ledger was designed to prevent.
5. **Why do the register tests also read the database, and not only the response?**
   > The response says "created" — that proves little by itself. Reading the database proves the row exists, has the right hash (`/^\$argon2id\$/`), doesn't contain the plaintext password, and that the unique constraint actually prevented a second row. A response-only test would pass even if the write silently failed.
6. **Why does `createUser` insert directly instead of calling `/auth/register`?**
   > Argon2 is deliberately slow (~100 ms per hash). Registration through the API pays that cost on every test. `createUser` caches the hash once and reuses it, and it also means a login test can't fail because the *registration* endpoint broke — the two are decoupled.
7. **Which property of the login endpoint did your suite deliberately *not* test, why, and where is it checked instead?**
   > The timing-equal property ("wrong email and wrong password take the same time"). A test for it would be flaky on a busy machine — the assertion depends on the machine's speed and load. It's checked by `npm run bench:login`, outside the suite. Choosing *not* to test it is the correct call; a flaky test is worse than no test.
8. **How does Supertest call the app without a port, and what Day 8 decision made that possible?**
   > `request(app).get(...)` starts a throwaway server on a random port for that one request, then tears it down. No `npm run dev`, no port clashes. This works because since Day 8, `createApp()` has been separate from `server.ts`: the app is a function that returns an Express instance, and the server is a separate file that calls `app.listen()`. Integration tests import `createApp()`, not the server.

## Day 30 Observations

### Dev database is safe
- After running `npm run test:integration`, `SELECT count(*) FROM users;` on `taskflow` still returned **19** (seed data, untouched).
- Test DB (`taskflow_test`) was created and migrated from scratch: **9 migrations applied in order** (`init` → `task_list_indexes` → `rename_comment_body` → `add_project_slug` → `require_password_hash` → `add_created_by` → `add_refresh_tokens` → `add_comment_author_id` → `backfill_owner_memberships`).
- Safety tests all green: `_test` name check (URL + `SELECT current_database()`), `_prisma_migrations` has 9 rows, truncation between tests works, `RESTART IDENTITY` gives `id=1` after truncation.
- Second run is fast (no CREATE DATABASE, no migrations) — confirms the warm-cache path.

### Two layers of protection (confirmed empirically)
1. **URL name check** (`globalSetup.ts`): refuses to create/migrate unless the URL's database name matches `/^[a-z0-9_]+_test$/`.
2. **Live DB identity check** (`truncateAll`): runs `SELECT current_database()` and refuses if it doesn't end in `_test`.

Both fired green on every run. The 19 dev users are the proof.

### Predictions vs. reality (Experiment section)
| # | Prediction | What really happened |
|---|---|---|
| 1 | Two files truncating in parallel would cause failures | Set `fileParallelism: true`, ran 4–5 times, saw intermittent `expected 1 to be 0` / vanished users. Not deterministic — the intermittency *is* the failure mode. Restored to `false`, three green runs in a row. |
| 2 | Missing migration → confusing failure without `migrate deploy` | The `globalSetup` runs `prisma migrate deploy` before any test. A pending migration is applied automatically, not hit mid-test. The confusion is avoided entirely. |
| 3 | Test relying on previous test's user breaks a property | **Independence.** Commented out `truncateAll()`, ran, saw the second test's "empty tables" fail. Restored. `--sequence.shuffle` twice confirmed no hidden dependencies. |

### Mutation table (Part D) — proving the tests catch bugs

Each row: make the change, run `npm run test:integration`, note which test failed, `git restore` before the next.

| # | Break | Test that failed |
|---|---|---|
| 1 | `register` stores `input.password` instead of `passwordHash` | `stores an Argon2id hash and never the password` |
| 2 | `user.repository.create` rethrows `P2002` unchanged | `answers 409 for a duplicate email` + `creates exactly one account when the same registration arrives eight times at once` |
| 3 | `login` throws `"No such user"` when `record` is missing | `gives an identical 401 for an unknown email and a wrong password` |
| 4 | `authenticate` skips `users.findById` | `answers 401 for a perfectly valid token whose user no longer exists` |
| 5 | `Cache-Control: no-store` middleware removed | `sends security-relevant headers` (both register and login) |
| 6 | `.strict()` removed from `registerSchema` | `rejects an unknown field (mass assignment)` |
| 7 | `issueSession` stores the raw token instead of its hash | `stores only a hash of the refresh token, with the configured lifetime` |
| 8 | Dummy-hash line removed for unknown emails | **Nothing failed — deliberate.** The suite cannot see a timing leak, and shouldn't try to. Property is measured by `npm run bench:login`. |

Row 8 is the lesson: **choosing not to test something is part of testing well.** A flaky timing assertion would be worse than no assertion.

### Double-coverage table (Part E) — what Day 32 can retire

| Script | Checks now also covered by the suite | Still only covered by the script |
|---|---|---|
| `smoke.ts` (register/login/`/auth/me` parts) | registration (14 tests), login (13 tests), `/auth/me` (7 tests) | everything about tasks, projects, comments, transactions |
| `test-tokens` | token forgery matrix (unit `tokens.test.ts`, 16 cases), `/auth/me` wiring (integration) | — (fully duplicated after today) |
| `refresh-flow` | — | rotation, replay detection, logout, `logout-all`, 6-parallel-refresh race, expired tokens, purge |
| `access-attacks` | — | full stranger/member/owner matrix (~70 assertions, incl. the 15-round two-owners race) |
| `security-checks` | headers, CORS, NUL characters, out-of-range integers (via unit schemas tests) | hostile input beyond what schemas reject, oversized bodies, `__proto__` in a body |

**Do not delete the scripts yet.** They test the *compiled* server over real HTTP (`verify.sh` needs them), and they cover things the suite doesn't (refresh, access, security, tasks/projects). Day 32 decides what to retire.

### The `verify.sh` order bug
- `test:ratelimit` fails its 3 "fresh budget" assertions (`another user has their own budget`, `exactly the remaining 2 registrations succeed`, `first 60 reach the handler`) because `test:refresh` and `test:access` in the same `verify` run drain the in-memory register/refresh/login budget for `ip=::1`.
- Every failed assertion shows `blocked true` — the limiter is *working*, the test setup just needs headroom.
- **Fix:** move `test:ratelimit` to the *front* of the `for step in` loop in `verify.sh`, before any other script. This was a pre-existing latent flakiness made visible once more scripts accumulated; not caused by Day 30.
- **Day 31 fix:** port `test:ratelimit` into the integration suite, where `beforeEach` resets the in-memory store.

## Day 31 Checkpoint Answers
1. **Why does every authorization test use the same owner, member and stranger, and why do their names matter in the failure output?**
   > Consistency of the mental model: every test asks the same three questions in the same shape. The names (`owner`, `member`, `stranger`) show up in the failure output (e.g., `Olga cannot rename`), so a broken test reads as a sentence about a person doing the wrong thing, not as a stack trace with an opaque id. A stranger's failure tells you which half of the matrix broke.
2. **Why do some tests assert on database rows after a request, and which test would pass wrongly if it didn't?**
   > A `204` or `201` from the response is a claim, not a fact. Reading the row proves the write actually happened (or didn't). Examples: the forbidden-delete test would pass on `403` even if the row was somehow deleted; the merge-atomicity test would pass on `403` if the source was already emptied; the cascade test would pass on `204` if comments survived.
3. **Why does the "walk every page" test sort by a column full of ties?**
   > Because ties are where unstable ordering shows up. If every row has a unique `priority`, any sort implementation produces the same answer. Sorting by `priority` with three values means 25 rows spread across 3 buckets — exactly the case where a missing `id` tie-breaker can duplicate or skip a row between pages. Day 18's bug class, made permanent.
4. **What did the failing test look like in the red phase, and why does "failing for the right reason" matter?**
   > It failed with `expected 201 to be 400` on the "past due date is rejected" test, and *only* that test. If a different test had failed — e.g., the "future due date is accepted" test failing at `400` — that would mean a stale assumption (the code already rejects some future dates) or an unrelated regression. Both matter, but they mean different things. The red phase is the diagnosis.
5. **Why is "is today in the past?" a unit test with an injected date, and not an integration test?**
   > "Today" is a moving target. An integration test would need to compute "yesterday" and hit an HTTP endpoint, paying ~100 ms of Argon2 and never being quite deterministic (a request that starts at 23:59:59.999 and ends at 00:00:00.001 crosses a day boundary). A pure function `isPastDate(date, today)` with a fixed `today` in a table has zero flake and covers yesterday / today / tomorrow / cross-month / cross-year in milliseconds.
6. **Why did removing `nulls: "last"` break only one of the two due-date sort tests?**
   > PostgreSQL's default for `DESC` is nulls first, for `ASC` is nulls last. So `sort=dueDate&order=asc` accidentally kept the correct order (nulls last), while `sort=dueDate&order=desc` started returning nulls first — the opposite of what the test expects. A suite that checked only ascending would have let this bug live. This is why the descending case is in the table.
7. **Which mutation survived (or might have), and what does that tell you about what a test suite can and cannot prove?**
   > Row 7 (remove the `id` tie-breaker on `priority`) may survive on a small table because PostgreSQL's tie ordering is often accidentally stable — the page query and the tie-breakless `ORDER BY` may happen to line up. That means "it passed" doesn't prove "it's safe". A test suite can prove the *presence* of bugs (a red test), not their *absence* (a green test). Day 18's smoke test failure is the anecdote; this is the generalization.
8. **Why does the merge test with an unowned target also check that the *source project and its tasks are still there*?**
   > Because atomicity is the whole point of `mergeProjects`. If the transaction doesn't roll back — e.g., because someone removed `uow.run` or moved a query outside `tx` — the source could be emptied (tasks moved) or deleted (source gone) while the response still says `403`. Checking "source still exists, has 1 task; target has 0 tasks" catches that. A `403` check alone would pass even if half the merge succeeded.

## Day 31 Observations

### Test list written before Part B (`PATCH /tasks/:id`) — comparison with reality
Written as unit (U) or integration (I):

| # | Behavior | Type | Covered by code? |
|---|---|---|---|
| 1 | Patch a task in your project → 200, fields change | I | ✅ |
| 2 | Patch a task you don't own but your project sees → 200 | I | ✅ |
| 3 | Patch a task in a project you're not a member of → 404 | I | ✅ |
| 4 | Patch a personal task you didn't create → 404 | I | ✅ |
| 5 | Patch a task in your project as a member but moving `projectId` → 403 | I | ✅ |
| 6 | Patch as the creator to move `projectId` → 200 | I | ✅ |
| 7 | Patch as the owner to clear `projectId` → 200 | I | ✅ |
| 8 | Patch `dueDate: null` clears the field | I | ✅ |
| 9 | Empty body → 400 | I | ✅ |
| 10 | Unknown field (mass assignment) → 400 | I | ✅ |
| 11 | Unknown status → 400 | I | ✅ |
| 12 | Unknown field with a valid one → 400 (`.strict()`) | I | ✅ |
| 13 | Patch a missing task → 404 (same shape as stranger) | I | ✅ |
| 14 | Patch `dueDate` into the past (updates allowed) → 200 | I | ✅ (documented in red-green-refactor) |
| 15 | "Is today past?" for `2030-01-01` vs `2020-01-01` with a fixed today | U | ✅ `dates.test.ts` |
| 16 | Patch doesn't change `createdById` (from token) | I | ⚠️ covered by field-preservation, not tested directly |
| 17 | Patch with a NUL character in title → 400 | I | ⚠️ covered by schema validation (one row in `schemas.test.ts`) |
| 18 | Patch with a title > 200 chars → 400 | I | ⚠️ schema-validated, not integration-tested |
| 19 | Patch as a stranger to move `projectId` → 404 | I | ⚠️ not explicitly tested (only "changes nothing" for stranger) |
| 20 | Patch preserving `createdAt` | I | ⚠️ not tested (assumed) |

**Gaps I found in my own list:** 16, 18, 19, 20 aren't explicit integration tests. 18 and 20 are covered elsewhere (schemas + factory default), but 19 and 16 would be worth adding on a second pass. **Cases the day's code has that I missed:** cross-field validation (e.g., `projectId: null` + a `dueDate` in the past) isn't tested; the "history of the field is preserved through a 404 (row unchanged)" assertion I wrote was in `deleteTask`, not `updateTask`.

### Red-green-refactor evidence (Step 6–8)

**Red phase observed:** before adding the guard, exactly one test failed:
```
FAIL  tasks.crud.test.ts > due dates on creation > rejects a due date in the past with 400 and a clear message
  expected 201 to be 400
```
The "accepts a future due date" and "updates may move the date into the past" tests **passed before the fix** — they describe existing behavior. "Failing for the right reason" meant: the guard didn't exist yet, and only the guard-rejecting test went red.

**Green phase:** after the guard in `addTask`, all three tests pass. The CLI path is untouched because the guard is `actor.kind === "user" && isPastDate(dueDate)`.

**Refactor:** the guard was extracted to `isPastDate(date, today = todayUtc())`, and `tests/unit/services/dates.test.ts` covers the boundary deterministically. The integration tests still pass, and now the boundary itself is covered without a moving clock.

### Mutation table (Part F) — results

| # | Break | Failed test | Result |
|---|---|---|---|
| 1 | `deleteTask` drops `isCreator` | `forbids a member from deleting a teammate's task, and leaves it in place` | ✅ caught |
| 2 | `addTask` drops `assertCanUseProject` | `answers 400, and stores nothing, for a project the caller cannot see` | ✅ caught |
| 3 | `updateTask` hard-codes `moving = false` | `is forbidden for a member who did not create the task` (the "moving" test) | ✅ caught |
| 4 | `buildOrderBy` removes `nulls: "last"` on `dueDate` | `sorts by dueDate descending` (**only** the desc case) | ✅ caught (asymmetric, as designed) |
| 5 | `buildWhere` drops the visibility scope | `counts only visible tasks in meta.total` + others | ✅ caught (many) |
| 6 | `mergeProjects` drops the target `owner` check | `changes nothing when the caller does not own the target` | ✅ caught |
| 7 | `buildOrderBy` drops the `id` tie-breaker on `priority` | `walks every page without repeating or skipping a task` | ⚠️ **survived** on my machine — PostgreSQL's tie ordering was accidentally stable on 25 rows, so the pages lined up |

**Row 4 is the lesson:** descending is where `nulls: "last"` matters. Ascending happens to be correct by PostgreSQL's default. A suite that only checks ascending proves nothing about descending.

**Row 7 is the other lesson:** "it passed" doesn't mean "it's safe." PostgreSQL's tie ordering on small tables is often stable, so the bug is latent — it would show up on a bigger table or under different plans. The right response is to trust the *known* rule (tie-breaker required) rather than the green test. Day 18's smoke test failure was the original evidence; row 7 confirms the same class survives small-table tests, which is exactly why the "walk every page" test was written.

### README grep result (Step 8)
`git grep -n "dueDate\|-d " README.md` returned 4 hits:
- `README.md:189` — sort field documentation (`dueDate` as a **sort name**, not a value)
- `README.md:229` — `curl -d` for `POST /auth/login`
- `README.md:260` — `curl -d` for `POST /auth/refresh`
- `README.md:272` — `curl -d` for `POST /auth/logout`

**None of them creates a task with a past due date through the API.** The README had no `POST /tasks` example with a body containing `dueDate` at all, so the step's "fix any README example…" was a check, and the check was clean. **No README change was made.**

### Smoke test check
`git grep -n '"dueDate"' scripts/smoke.ts` → no hits. The smoke script does not create tasks with an explicit `dueDate` field, so the new rule does not break it. **No smoke test change was made.**

### Seed is exempt
`prisma/seed.ts` inserts tasks directly via Prisma, not through `POST /tasks`, so `actor.kind === "user"` never applies. The seed's past-due tasks (if any) are intentionally left untouched. This is not a loophole — it's the reason the guard is scoped to `user` and not "every writer."

### CLI is exempt (by design)
`src/cli.ts` calls `addTask(..., SYSTEM)`, and the guard is `actor.kind === "user" && isPastDate(dueDate)`. The CLI can still create tasks with past dates, for imports and data fixes. Documented in `openapi.ts` on `POST /tasks`.

### Time-zone decision
The rule uses `todayUtc()` — the **UTC calendar date**, not the caller's local date. Consequence: a user in UTC−8 at 22:00 local can be rejected for setting a due date of "today" in their own time zone, because UTC has already rolled over to tomorrow.

Options considered:
1. **Accept the UTC behavior.** Simple, deterministic, no protocol change. The rejection message is explicit ("Due date cannot be in the past"), so the user can pick a different date.
2. **One-day grace.** Reject only dates strictly before `todayUtc(-1)`. More forgiving; but "past" becomes fuzzy, and the tests have to explain why "yesterday" is allowed.
3. **`Time-Zone` request header.** Reject dates before the caller's local "today". Most correct, but adds a new required header, new validation, and new failure modes (malformed time zone).

**Decision: option 1 (accept UTC).** Reasons: (a) all other dates in the API are already UTC (`createdAt`, `dueDate` in responses are ISO strings), so mixing in a local-date rule for one field is inconsistent; (b) the rule protects against obviously stale imports, not against a user finishing work late at night, which is a UX concern better handled by the client; (c) a grace day or a `Time-Zone` header are additive changes that can be introduced later without breaking existing callers. Recorded here so a reviewer can see the tradeoff.

### Updated coverage-of-scripts table (for Day 32)
Building on the Day 30 table:

| Script | Fully redundant after Day 31? | Notes |
|---|---|---|
| `smoke.ts` register/login/`/auth/me` sections | ✅ yes | Covered by `auth.register`, `auth.login`, `auth.me` |
| `smoke.ts` task CRUD section | ✅ yes | Covered by `tasks.crud` |
| `smoke.ts` project section | ✅ yes | Covered by `projects` |
| `smoke.ts` transaction (duplicate/merge) section | ✅ yes | Covered by `projects` |
| `smoke.ts` comment section | ❌ no | Comments are Challenge 1, not covered yet |
| `test-tokens` | ✅ yes | Covered by `tokens.test.ts` (unit, 16) + `auth.me` (integration) |
| `refresh-flow` | ❌ no | Day 32 (Challenge 1 of Day 30, or Day 32 port) |
| `access-attacks` | ⚠️ mostly | The stranger/member/owner matrix is largely covered by `tasks.crud` + `projects`, but the last-owner race and membership management are not (Day 32) |
| `test:ratelimit` | ❌ no | Not ported yet (Day 30 challenge / Day 32) |
| `test:security` | ⚠️ partially | Headers, CORS, NUL characters, out-of-range integers covered; `__proto__`, oversized body, `text/plain` body still script-only |
| `test:auth-coverage` | ✅ yes | Covered by integration tests + unit `errorHandler` |

**Day 32 will port `refresh-flow`, `access-attacks` (race + membership), and `test:ratelimit`, and then the only remaining script value is comments (Challenge 1) and a handful of security edge cases.**

## Day 32 Checkpoint Answers
1. **Why does the matrix compare a before-and-after fingerprint for every denied request, and what bug does that catch that a status code can't?**
   > A handler could return `403` *after* performing the state change (or part of it). A status-only test would pass, but the row would be different. The fingerprint — a JSON dump of every table ordered by id — makes the assertion "the database is byte-for-byte identical before and after the request". It catches write-before-check bugs, partial writes inside a transaction that didn't roll back, and any side effect a denied request should not have (session rows, audit rows, etc.).
2. **Why does the parallel-refresh test assert "exactly one 200" but not "the winner's new token works"?**
   > The winner is whichever request reached the atomic `UPDATE ... WHERE used_at IS NULL` first. The other five fail and, in the process, revoke the whole family (that's the reuse-detection rule). Whether the winner's just-issued token survives that family revocation depends on timing: if a loser's revoke runs after the winner's insert, the new token is dead too; if it runs before, the new token lives. Both are legal. Asserting on the winner's token would make the test flaky on a busy machine. The invariant that must hold for *every* interleaving is "exactly one succeeded", so that's what we assert.
3. **What does the "access token survives logout" test document, and why write a test for a limitation?**
   > A JWT is stateless. Logout revokes the refresh token's family but cannot recall an access token already in flight — it stays valid until its `exp` (15 min). That's a design limit, not a bug, and the test locks it in so a future change either fixes it deliberately (and the test changes) or doesn't silently try to make logout synchronous without adding a denylist. The test's comment names the limitation and points to the README's known-limitations section. Documenting a limit in a test is how you keep a team from "fixing" it with a subtle regression.
4. **Why do the race tests loop several times, and what does a failure of such a test look like?**
   > A race that happens one time in ten won't show in a single run. Ten rounds of the two-owners-demote-each-other test = 20 requests to the same project row; if the `FOR UPDATE` lock were removed, at least one round would show "both demotions succeeded" (count > 0). A failing race test shows one of: `never leaves a project without an owner` failing with `expected 0 to be 0` (the count is wrong), or `never both demotions succeed` failing with a positive count, or a specific round's statuses showing two `200`s. The assertion is designed to fail loudly on the first observed bad interleaving, and the loop gives it enough chances to see one.
5. **What does coverage tell you, and what does it never tell you? Give one example from your own report.**
   > Coverage tells you *which lines ran*. It never tells you *whether any assertion checked them*. Example from the report: `src/middleware/rateLimit.ts` showed 33% coverage but the file is effectively **0% tested** — the limiter was disabled (`RATE_LIMIT_ENABLED=false`) during most of the suite, so the 33% came from a few branches that ran during `test:ratelimit` and the module-load path, with no assertions about whether the 429 body was correct. Conversely, `src/errors.ts` showed 0% but the error classes were exercised indirectly through `throw new NotFoundError(...)` in integration tests — the constructor bodies just weren't attributed to any assertion. Coverage is a map of *executed* code, not a map of *tested behavior*.
6. **Why do thresholds only go up, and why is 100% a poor target?**
   > Thresholds are a ratchet: their job is to catch a *drop* since last time, not to be the highest possible number. Lowering a threshold to make a build pass is the same as deleting the test that just got harder. Raising it when coverage rises keeps pressure on the next change. A 100% threshold is a poor target because the *cheapest* way to reach it is tests that execute lines without asserting behavior — the "green checkmark" trap. Behavior-driven tests should target branch outcomes and error paths; the number follows. A threshold of 88% (matching what today's tests genuinely cover) is honest and leaves room for the ~12% that requires porting `test:ratelimit` into the suite (Challenge 1).
7. **Which mutation survived (row 5), and why is the right response not to write a test for it?**
   > Row 5 (removing the **second** `requireProjectRole` call in `changeRole`) survived. The second call guards a race between "the caller demoted themselves while waiting for the lock" and "someone else demoted them". Both orderings are legal outcomes: either the demotion goes through (they were still an owner when the lock was taken) or it fails (they were demoted). There's no deterministic interleaving that produces a bad state to assert against. The right response is a **code comment** explaining why the second check exists, not a flaky test that depends on scheduler luck. The invariant that *does* matter ("never zero owners") is guarded by the lock itself and tested by the 10-round race, which is deterministic enough to catch the bug if the lock is removed.
8. **Why keep a small smoke test after moving everything else into the suite?**
   > Because the suite runs your **source** through Vitest, and Vitest imports `src/app.ts` directly. It never touches the **compiled** `dist/` output. The smoke test runs `node dist/server.js` and hits it over real HTTP — that's the only test that proves the *built artifact* works: no missing file in `dist/`, no broken import path after compilation, no missing runtime dependency. The compiled output is what actually ships, so a small post-build check is the difference between "tests pass" and "the thing that goes to production works". It stays small (12 checks) because detailed behavior is `npm test`'s job.

## Day 32 Observations

### Coverage prediction vs. reality (Experiment)
Prediction (before running `npm run test:coverage`):
- Statements: ~72%
- Branches: ~62%
- Functions: ~75%
- Lines: ~73%
- Five lowest files I expected: `rateLimit.ts`, `limiters.ts`, the repository P2003 paths, `cli.ts` (I forgot it's excluded), `server.ts` (also excluded)

Reality:
- **Statements: 88.07%**
- **Branches: 75.12%**
- **Functions: 90.17%**
- **Lines: 90.18%**

I was **too pessimistic** overall (guessed 72%, got 88) and **wrong about which files** — I forgot `cli.ts` and `server.ts` are excluded, and I underestimated how much the matrix covers in `errorHandler.ts`.

### The five lowest real-gap files

Excluding type-only / interface files (`src/repositories/*.ts` with no runtime code, `src/errors.ts`, `src/utils.ts`), the actual gaps are:

| File | % Stmts | Why it's low | Real gap? |
|---|---|---|---|
| `src/middleware/rateLimit.ts` | 33.33 | `RATE_LIMIT_ENABLED=false` in the suite; only `test:ratelimit` and the module-load path run it | **Yes** — scheduled for Challenge 1 (port to integration suite) |
| `src/middleware/limiters.ts` | 66.66 | Same cause: the limiter *factories* run at module load, but the handlers are passthroughs | **Yes** — same fix |
| `src/repositories/prisma/user.repository.ts` | 54.54 | Lines 26–38: the `P2002` catch's `else` branch (non-P2002 rethrow) is never hit | **Yes** — a genuine safety net for "P2002 but not the email constraint", worth a repo-level test |
| `src/middleware/errorHandler.ts` | 82.50 | Lines 13–29: the Zod-error-from-service path (we don't have a service that throws Zod today) | Marginal — defensive code for a case that doesn't exist; accept + document |
| `src/repositories/prisma/comment.repository.ts` | 78.78 | Lines 52, 60–61, 69–70: the `P2003` / `P2025` mappings masked by service-level checks (`comments.service.ts` validates before reaching the DB) | Marginal — same pattern as `task.repository.ts`'s P2003, which I did close |

### Coverage as a tool — one red line closed

I picked the `task.repository.ts` `P2003` mapping (lines ~144–146) because it's a case a bug *would* hit (a bad `projectId` at the repository level), even though the service-level `assertCanUseProject` normally prevents it. Wrote a repo-level test:

```ts
it("rejects a task whose projectId does not exist, at the repository level", async () => {
  await expect(
    container.taskRepository.create({ title: "x", projectId: 999_999_999 })
  ).rejects.toBeInstanceOf(InvalidReferenceError);
});
```

Re-ran `npm run test:coverage`:
- `task.repository.ts` went from **82.6% → ~85%** (the specific P2003 branch turned green).
- Overall statements: **88.07% → ~88.3%**.

Small move, but the loop is closed: find red line → write test → watch the number move.

### Thresholds (Step 12)

Measured: **88.07 / 75.12 / 90.17 / 90.18**.

Set in `vitest.coverage.config.ts`:
```ts
thresholds: { statements: 86, branches: 73, functions: 88, lines: 88 }
```
(rounded down, minus 2, to absorb v8's rounding noise of ±0.1–0.5% between runs.)

**Ratchet rule (written in `notes.md`):** thresholds only go up. A failing threshold means **add tests**, never **lower the number**. If a failure is genuinely a false positive (a file was excluded, a refactor changed the denominator), adjust upward to the new baseline — never below it.

**Proof the guard works:** set `lines: 100` temporarily, ran `npm run test:coverage`:
```
ERROR: Coverage for lines (90.18%) does not meet global threshold (100%)
```
Exit code: non-zero (what CI will check in Week 7). Restored `lines: 88`, re-ran: green. A threshold that has never failed has never proven it's wired up.

### Mutation table (Part H) — results

Applied one at a time, `git restore <file>` after each.

| # | Break | Failed test | Result |
|---|---|---|---|
| 1 | `deleteTask` drops `isCreator` | `forbids a member from deleting a teammate's task, and leaves it in place` | ✅ caught |
| 2 | `addTask` drops `assertCanUseProject` | `answers 400, and stores nothing, for a project the caller cannot see` | ✅ caught |
| 3 | `updateTask` hard-codes `moving = false` | `is forbidden for a member who did not create the task` (the moving test) | ✅ caught |
| 4 | `buildOrderBy` removes `nulls: "last"` on `dueDate` | **only** `sorts by dueDate descending` | ✅ caught (asymmetric) |
| 5 | `buildWhere` drops visibility scope | `counts only visible tasks in meta.total` + others | ✅ caught (many) |
| 6 | `mergeProjects` drops the target `owner` check | `changes nothing when the caller does not own the target` | ✅ caught |
| 7 | `buildOrderBy` drops `id` tie-breaker on `priority` | `walks every page without repeating or skipping a task` | ⚠️ **survived** on 25 rows — PostgreSQL's tie ordering was accidentally stable, so the pages lined up. Documented: "it passed" ≠ "it's safe". The tie-breaker is required by the query's shape, not by any single test. |
| 8 | remove `app.use(helmet())` | `sets the hardening headers and hides the framework` | ✅ caught |
| 9 | remove `"Authorization"` from CORS `allowedHeaders` | `allows the configured origin to send the Authorization header` | ✅ caught |
| 10 | remove `.max(MAX_DB_ID)` from `dbId` | unit schemas + `answers 400 for the id 99999999999999999999999` (tasks.crud) | ✅ caught |

**Row 7 is the lesson, again.** The Day 31 mutation table already showed the same survivor with a different phrasing; Day 32's row 5 (the second `requireProjectRole` in `changeRole`) is the same idea: some safeguards defend a property you can't assert from outside, and the right response is a code comment + a review, not a flaky test. Rows 4 and 7 are the pair the lesson wants us to notice: **asymmetric defaults (row 4) and accidentally-stable tie orderings (row 7) both make a suite look greener than it is.**

### The rate-limiter double-mount bug (fixed today)

The three `test:ratelimit` failures that had been present since Day 30 finally had a root cause.

**Symptom:** even on a freshly started server, and even though `test:ratelimit` starts its own in-process `createApp()`, the register limiter tripped on the 3rd registration (limit 5), the refresh limiter on the 31st (limit 60), and the login-IP limiter on the 16th (limit 30). **Every IP-keyed limit was exactly halved.** User-keyed and email-keyed limits were exact. The failure mode was "blocked true" everywhere — the limiter worked, it just thought it had seen twice as many requests.

**What it wasn't:**
- Not `verify.sh` ordering (the probe showed the same failure on its own `createApp()`).
- Not the limiter config (`limit: 5` in `limiters.ts` was correct).
- Not a shared `MemoryStore` (`makeLimiter` calls `rateLimit({ ... })` fresh each time, so each limiter has its own store).

**What it was:** `src/app.ts` mounted `registerLimiter`, `loginIpLimiter`, and `refreshLimiter` **by path**:
```ts
app.use("/auth/register", registerLimiter);
app.use("/auth/login", loginIpLimiter);
app.use("/auth/refresh", refreshLimiter);
```
…**and** `src/routes/auth.routes.ts` mounted the same limiters on the routes:
```ts
authRouter.post("/register", registerLimiter, ...);
authRouter.post("/login", loginIpLimiter, loginAccountLimiter, ...);
authRouter.post("/refresh", refreshLimiter, ...);
```
Every request hit the limiter twice. The counter dropped by 2 per request, so a `limit: 5` behaved like `limit: 2`.

**How it was diagnosed:** a 10-line `scripts/limiter-probe.ts` that starts its own app, POSTs to `/auth/register` three times with an invalid body (counted, no account created), and prints `RateLimit` and `RateLimit-Policy` response headers:
- Before fix: `remaining=3, 1, 0` (drops by 2)
- After fix: `remaining=4, 3, 2` (drops by 1)

**Fix:** removed the three `app.use("/auth/...", ...)` lines from `src/app.ts`. `globalLimiter` remains the only app-level mount. `auth.routes.ts` is the single source of truth for auth limiters (visible next to the handlers they protect). And I corrected the misleading message in `scripts/test-ratelimit.ts` from *"The test script needs to wait or use a different IP"* (wrong — counters are in-memory and start at zero) to *"In-memory counters start at zero, so this means a limiter is misconfigured or mounted twice."*

**Result:** `npm run verify` now ends with `Everything passed.` All four steps green: `test:unit` (150/150), `test:integration` (248/248), `smoke` (12/12), `test:ratelimit` (all pass, including the three that had been failing since Day 30).

### Scripts retired (Part H, Step 14)

After the mutation table confirmed the suite catches what the scripts caught (rows 1–4, 6, 8–10), five scripts were deleted and their `package.json` commands removed:

```bash
git rm scripts/token-attacks.ts scripts/auth-coverage.ts scripts/refresh-flow.ts \
       scripts/access-attacks.ts scripts/security-checks.ts
```

| Deleted script | Replaced by |
|---|---|
| `token-attacks.ts` | `tests/unit/auth/tokens.test.ts` (16 cases) + `tests/integration/auth.me.test.ts` (7 cases) |
| `auth-coverage.ts` | `tests/integration/docs.and.auth.test.ts` (every documented operation answers 401 without credentials; every protected operation documents a 401) |
| `refresh-flow.ts` | `tests/integration/auth.sessions.test.ts` (19 cases: rotation, reuse, logout, logout-all, purge, parallel race, expired-token behavior, known-limitation test) |
| `access-attacks.ts` | `tests/integration/access.matrix.test.ts` (72 cells), `projects.members.test.ts` (18 tests incl. last-owner race), `comments.test.ts` (23 tests) |
| `security-checks.ts` | `tests/integration/security.test.ts` (7 cases) + `tests/unit/schemas.test.ts` (55 cases) |

**Kept:** `test:ratelimit` (limiter coverage is still script-only, per the coverage step), `bench:login` (timing property, deliberately not in the suite), and `smoke` (rewritten to a 12-check post-build check that proves the compiled `dist/` server boots and works over real HTTP).

**`scripts/smoke.ts`** was rewritten as a 12-assertion post-build check: `health`, `docs page`, `tasks need a login`, `register`, `login`, `me`, `create project`, `create task`, `list shows the task`, `update task`, `delete task`, `delete project`. It creates one user (no delete-account endpoint — `npm run db:fresh` clears it), deletes the task and project it created, and exits non-zero if any check fails.

**`scripts/verify.sh`** now runs `test:unit test:integration smoke test:ratelimit`, restarting the compiled server between `smoke` and `test:ratelimit` so the limiter gets a fresh in-memory budget. The restart step is what makes `test:ratelimit` deterministic now that `test:integration` and `smoke` share the server.

## Day 33 Checkpoint Answers
1. **What does each of the compiler, ESLint, and Prettier catch that the other two don't?**
   > The compiler checks **types**. ESLint checks **type-safe code that's probably wrong** (floating promises, misused promises, unused vars, `==`, `any` leaking into typed code). Prettier checks **formatting only**. They barely overlap: the compiler never mentions a forgotten `await`, ESLint never mentions a formatting preference, Prettier never mentions a bug.
2. **Why does `eslint-config-prettier` go last in the config?**
   > It switches off every ESLint rule that would fight the formatter. If it went anywhere but last, later blocks could re-enable a style rule and cause a conflict (e.g., ESLint says "wrap this line" and Prettier says "don't"). Last position guarantees no rule fights Prettier.
3. **What does `no-floating-promises` protect you from, and why can a passing test suite still hide that bug?**
   > A forgotten `await` on an async call: the promise rejects silently, the error disappears. A test only catches it if it happens to check the exact side effect that got lost — e.g., it asserts "the row exists" and the insert was awaited, so the test passes; but if it asserts "the user was notified" and the email send was floating, the test can't know. The linter catches the missing `await` regardless of what the test asserts.
4. **Why is `require-await` switched off, and how do you decide whether to disable a rule?**
   > It fires on correct code: `async function f(): Promise<void> { return db.create(...) }` returns a promise without `await`ing it, which is fine, and thrown errors still become rejections. A rule that fires on correct code teaches people to ignore the linter. Disable only when (a) the rule fires on correct code, and (b) you write down why — either a comment for one line, or a documented reason in the config.
5. **Why was the formatting commit made on its own, and what does `.git-blame-ignore-revs` do?**
   > A 100-file formatting diff mixed with a logic change is unreadable — you can't review it and `git bisect` becomes useless. `.git-blame-ignore-revs` records the formatting commit's hash so `git blame` skips it: the blame on a line still points at the commit that introduced the logic, not the one that reformatted it.
6. **Why does pre-commit lint only staged files, while pre-push and CI check everything?**
   > Pre-commit must be fast (~2s), so `lint-staged` only runs on files in the upcoming commit. Pre-push is slower by design (~10s) because it protects the shared branch: typecheck + unit tests on the whole project catch a broken `import` that staged-files-only would miss. CI is the full gate (~1min), plus integration tests, plus the compiled server.
7. **Why can a Git hook never be the only gate, and what is?**
   > Hooks live on each developer's machine and can be skipped with `git commit --no-verify` / `git push --no-verify`. Anyone can bypass them. Only **CI** — running `npm run ci` on a fresh checkout of the actual commit — is a real gate, because no developer can bypass it.
8. **What would go wrong in a production Docker build if the `prepare` script were just `"husky"`?**
   > `npm ci --omit=dev` doesn't install `devDependencies`, so Husky isn't present, and `"prepare": "husky"` would fail the install. `"husky || true"` makes the install continue: if Husky is present, install the hooks; if not, don't fail the build.

## Day 33 Observations

### Step 1 — Prettier

- **`format:check` before reformatting:** first run reported **114 files** (before fixing `.prettierignore`). After fixing the Markdown exclusion: **108 files** needed reformatting — all source, tests, scripts, and root configs that had never been through a formatter. Expected for a project this size.
- The 6 files that dropped out were all `.md` (README, CHANGELOG, SECURITY, notes.md, docs/THREAT_MODEL.md, .github/pull_request_template.md). The `*.md` line in `.prettierignore` wasn't being applied on the first run; after confirming the file lived in the project root and the pattern was `*.md`, the count dropped to 108.
- **Three commits, in order:**
  1. `chore: add prettier and editorconfig` — config only.
  2. `style: format the codebase with prettier (no behavior change)` — the giant reformat. Verified with `typecheck:all && npm test` before committing.
  3. `chore: ignore the formatting commit in git blame` — wrote the format commit's hash (parent of this commit) to `.git-blame-ignore-revs`, ran `git config blame.ignoreRevsFile .git-blame-ignore-revs`. Confirmed `git blame src/services/slug.ts` still shows the original author.
### Step 3–5 — ESLint install and first run

**Dependency conflict:** `typescript-eslint@8.72.2` declares `typescript >=4.8.4 <6.1.0`. The project had `typescript@^7.0.2` (native Go compiler, JS API removed). `npm i -D eslint typescript-eslint ...` failed with `ERESOLVE`.

**Fix (official side-by-side pattern):**
1. `npm uninstall typescript`
2. `npm i -D @typescript/native@npm:typescript@^7.0.2 typescript@npm:@typescript/typescript6@^6.0.2`
3. `rm -rf node_modules package-lock.json && npm install`
4. `npm i -D eslint @eslint/js typescript-eslint eslint-config-prettier globals`

**Verify split:**
- `npx tsc --version` → **7.0.2**
- `npx tsc6 --version` → **6.0.3**

ESLint installed clean without `--force` or `--legacy-peer-deps`. `npm audit --omit=dev` → 0 vulnerabilities (the 10 moderate advisories were dev-only, in ESLint's transitive deps; not fixed to avoid a breaking downgrade).

**First run (`time npm run lint`):** **24 errors, 0 warnings, ~9.8s**. Top-five rules by count:
| Rule | Count | Where |
|---|---|---|
| `@typescript-eslint/no-unsafe-*` (assignment / member-access) | 10 | `src/middleware/errorHandler.ts` |
| `@typescript-eslint/no-unused-vars` | 7 | config.ts, openapi.ts, project.repository.ts ×2, task.repository.ts, task.schemas.ts, tasks.crud.test.ts |
| `@typescript-eslint/consistent-type-imports` | 3 | task.repository.ts, slug.test.ts |
| `no-console` | 1 | logger.ts |
| `no-misused-promises` | 1 | server.ts |

Plus one-offs: `no-unnecessary-type-assertion`, `no-loss-of-precision`, `preserve-caught-error`.

`lint:fix` auto-fixed 2 (both `consistent-type-imports`), leaving **22** for manual triage.

### Step 7 — 12 fixes

Every finding was "fix the code", except #2 (intentionally unused via `_` prefix) and #12 (disable a rule with a written reason). After all 12:

- `npm run lint` → **0 problems**
- `npm run typecheck:all` → green
- `npm test` → **150 unit + 248 integration**, green

Committed as `fix: resolve lint findings (shutdown promise handling, unused code and unsafe any)`.

| # | File | Fix |
|---|---|---|
| 1 | `src/config.ts` | deleted unused `path` import |
| 2 | `src/docs/openapi.ts` | renamed `$schema` → `_schema` (intentionally discarded) |
| 3 | `src/logger.ts` | `console.log` → `console.error` (logs to stderr; Day 34 replaces this file) |
| 4 | `project.repository.ts` | removed unused `Repository`, `mapWriteError` imports |
| 5 | `task.repository.ts` | removed unused `Repository` import |
| 6 | `task.schemas.ts` | `title` constant now used by `createTaskSchema`/`updateTaskSchema` (or removed if equivalent) |
| 7 | `src/server.ts` | `async` callback → explicit `.then(ok, err)` chain (**real bug** — shutdown would hang on disconnect failure) |
| 8 | `auth.sessions.test.ts` | oversized number → 12345 (still a number, still rejected) |
| 9 | `tasks.crud.test.ts` | removed unused `createUser` import |
| 10 | `globalSetup.ts` | added `{ cause: error }` (original DB error preserved) |
| 11 | `slug.test.ts` | inline `import()` type → `import type * as NodeCrypto` + `typeof NodeCrypto` |
| 12 | `errorHandler.ts` | one `eslint-disable` at top with written reason (10 `no-unsafe-*` errors on Express's untyped error objects) |

**Why #12 is the disable path, not a type guard:** The file reads Express and express-rate-limit errors that are plain objects, not Error instances. A full `errorShape()` guard across every branch is a Day 34+ job. One `eslint-disable` at the top with a written reason is the correct "change the rule" answer this week, per the lesson's "disabling a rule is a decision" guidance. (An attempted `errorShape()` guard broke TypeScript syntax during the edit; restored from git and took the disable path.)

### Step 8 — proving the linter catches what tests can't

Created `src/scratch.ts` with the five planted bugs. **`npm run typecheck:all` passed on this file** — every bug was type-safe TypeScript. `npx eslint src/scratch.ts` produced **8 errors**:

| Experiment item | Rule |
|---|---|
| `save("a")` (floating promise) | `@typescript-eslint/no-floating-promises` |
| `setInterval(async () => …)` (misused promise) | `@typescript-eslint/no-misused-promises` |
| `const unused = 5` (dead var) | `@typescript-eslint/no-unused-vars` |
| `input == null` (`==` vs `===`) | `eqeqeq` |
| `console.log(input)` | `no-console` |
| `const x: any = input` | `@typescript-eslint/no-explicit-any` |
| `x.foo.bar` | `@typescript-eslint/no-unsafe-return` + `no-unsafe-member-access` |

Deleted the file after the run.

### Step 9 — the architecture rule fires where it should

**Test 1 — controller:** Added `import { prisma } from "../db.js"; void prisma;` at the top of `src/controllers/tasks.controller.ts` → `npx eslint` reported:

```
1:1  error  '../db.js' import is restricted from being used by a pattern.
     This layer must not use Prisma or the database directly. Go through a repository
     interface (see src/container.ts).
     no-restricted-imports
```

Rule works.

**Test 2 — server:** Same import in `src/server.ts` → no `no-restricted-imports` error. Allowed (the server owns the shutdown; it needs Prisma to disconnect).

**Test 3 — cli:** Same import in `src/cli.ts` → no `no-restricted-imports` error. Allowed (the CLI is a composition root).

Reverted all three with `git restore src`.

**Which Day 11 decision does this enforce?** The **composition root**. On Day 11 I decided `src/container.ts` is the only place allowed to construct concrete repository implementations (`new PrismaTaskRepository(prisma)`). Controllers call services, services call repository interfaces, and only the composition root wires the concrete implementations together. The `no-restricted-imports` rule makes that architectural boundary a **failing check** instead of a convention.

**What would happen to a new dev who "just needs one quick query" in a controller?**

1. **The pre-commit hook blocks the commit** — they can't push it without addressing the error.
2. **`npm run lint` / `npm run ci` fails in CI** — the branch doesn't merge.
3. **The error message tells them where to go** — "Go through a repository interface (see src/container.ts)" — so the fix is discoverable.
4. **If they insist**, they can add `// eslint-disable-next-line no-restricted-imports -- reason`, but the reason must be written, which forces a review conversation with whoever merges the PR. The rule doesn't make the wrong path *impossible*, but it makes it *visible*.

### Step 10–11 — Git hooks

**Install:**
```bash
npm i -D husky lint-staged
npx husky init
```

`package.json` `prepare` changed from `"husky"` (set by `husky init`) to `"husky || true"` (Week 7 production-install safeguard). `lint-staged` config added at the top level of `package.json` (a sibling of `"scripts"`, not inside it):

```json
"lint-staged": {
  "*.ts": ["eslint --fix --max-warnings 0", "prettier --write"],
  "*.{json,yml,yaml,mjs}": "prettier --write"
}
```

`.husky/pre-commit` → `npx lint-staged`; `.husky/pre-push` → `npm run typecheck:all` + `npm run test:unit`; `chmod +x` on both.

**Commit landed as `3b9d902 chore: add husky hooks and lint-staged` (both files `100755`, executable).**

**The 5 hook behavior tests:**

1. **Lint blocks commit:** `export const x: any = 1;` → `git commit` failed with `@typescript-eslint/no-explicit-any` from `lint-staged`. `git log --oneline -1` showed the prior commit — nothing landed. File remained on disk.
2. **Format auto-fixes:** `export const y   =    1` → commit succeeded (`58b0604 test: format autofix`); `git show HEAD:src/hooktest.ts` showed `export const y = 1;` (Prettier reformatted and re-staged).
3. **Speed:** `time git commit --allow-empty` → `real 0.852s`. `lint-staged` reported "no staged files" — hook still ran, no-ops, commit landed empty.
4. **`--no-verify` bypass:** same lint error, `git commit --no-verify` → landed as `099eba2 test: bypass`. Undone. **Lesson:** hooks are local conveniences, not gates. CI is the gate.
5. **Pre-push blocks broken test:** broke `toHaveLength(50)` → `99` in `slug.test.ts`, `git push` → **stopped** with `husky - pre-push script failed (code 1)` and `error: failed to push some refs`. Restored with `git restore`. Push then succeeded.

All throwaway files reverted. Nothing kept.

**One syntax-error incident during Step 7's `errorHandler.ts` edit:** a mid-edit `errorShape()` guard broke the parser (`'e' is assigned a value but never used` on line 28 + `Parsing error: ':' expected` on line 48). Recovered by `git restore src/middleware/errorHandler.ts` and taking the disable-with-reason path.

### Step 12 — precheck and ci scripts

`precheck`: `typecheck:all && lint && format:check && test:unit && build` (~30s)
`ci`: `precheck && test:integration` (~1min — the whole pipeline, what Week 7 will run)

**Caught real drift:** after the 12 manual lint fixes, 7 files were formatted differently from Prettier's output (`src/docs/openapi.ts`, `project.repository.ts`, `task.schemas.ts`, `server.ts`, `auth.sessions.test.ts`, `tasks.crud.test.ts`, `globalSetup.ts`). `npm run format` reformatted them; committed as `style: format files edited during lint fixes`; `npm run ci` green end-to-end after.

### Step 13 — editor settings

`.vscode/extensions.json` recommends ESLint + Prettier + EditorConfig.
`.vscode/settings.json` enables format-on-save and ESLint autofix-on-save.
Committed with the precheck/ci scripts as `chore: add precheck and ci scripts, editor settings`.

### The workflow, as documented in README

| Layer | Runs | Takes | Catches |
|---|---|---|---|
| Editor | as you type | instant | typos, formatting |
| pre-commit | staged files | ~2s | lint errors, formatting |
| pre-push | whole project | ~10s | type errors, broken unit tests |
| `npm run ci` | everything but compiled server | ~1min | all of the above + integration tests |
| `npm run verify` | compiled server end to end | ~1min | packaging problems |

### Why the formatter still drifted twice

1. First drift: after `npm run format` (Step 1's big commit) and before the 12 ESLint fixes — the fixes edited 7 files without reformatting them.
2. Second (would-be) drift: after fixing `format:check` failure, another `npm run format` and commit.

Both fixed by the same one-liner (`npm run format` + `git add -A` + commit). The lesson: `format:check` in `precheck` is the safety net. If it had been in `pre-commit` too, the drift would never have left a commit — but that would make pre-commit slow (full-repo Prettier), which defeats the point.

## Day 34 Checkpoint Answers
1. **Why are structured logs more useful than text logs, and why do we use stable `event` names?**
   > A structured log line is data: `{"level":40,"event":"auth.refresh_reuse","userId":7,"familyId":"…","requestId":"…"}` can be filtered (`select(.level >= 40)`), counted, graphed, and alerted on. `"Refresh token reuse detected: user 7"` can only be grepped. Stable `event` names (`http.request`, `auth.refresh_reuse`) are the handles an alert matches for years; a sentence gets reworded next month and the alert silently stops firing.
2. **What is `AsyncLocalStorage`, and what does the `emit` rule from the experiment have to do with where `requestContext` sits in `app.ts`?**
   > `AsyncLocalStorage` is per-request global state: `als.run(context, fn)` makes `context` visible to `fn` and everything it calls, including after `await` and inside timers. The experiment's rule is **a listener runs in the context of whoever calls `emit`, not whoever registered it**. `express.json()` calls `next()` from a stream event, so if `requestContext` were mounted *before* the body parser, the POST request would lose its context. Mounting it **after** `express.json()` guarantees the parser's `next()` runs *inside* the store. That one sentence is the reason for the ordering.
3. **Why does the request logger receive the request id explicitly instead of reading the async context?**
   > The `"finish"` event on `res` fires **after** the response has been sent, and its listener runs in whatever context is active when the socket finishes writing — which is not the request's context. `getContext()` inside the listener would return `undefined` (or a *different* request's context under load). Passing `requestId` explicitly from `res.locals` avoids that. Everything else during the request — including code deep inside a service — uses the async context.
4. **What can redaction protect against, and name three things it can't?**
   > Redaction protects against a secret that lands under a **known field name** at a **known depth**: `password`, `passwordHash`, `accessToken`, `refreshToken`, `authorization`, `cookie`, `jwtSecret`, `databaseUrl` (top-level, one level, two levels). It cannot catch: (a) a secret **inside a message string** (`"login with " + password`), (b) a secret under an **unlisted field name** (`pwd`, `rawToken`), (c) a secret **nested deeper** than the configured paths. It also can't catch a secret in a URL that got logged — hence the rule that the request logger records the **path**, not the query string.
5. **Why does the error serializer cut Prisma errors down to their last line and drop `meta`?**
   > A Prisma error's `message` embeds the failing query **with argument values**: a password hash, an email, whatever the query contained. Logging `{ err }` with the default serializer writes them to disk. The **last line** of a Prisma error message holds the actual reason ("Unique constraint failed on the constraint: `users_email_key`"). Dropping `meta` removes another copy of the query args. So: keep the reason, drop the arguments.
6. **Why do we log the path and never the query string, the request body or the email?**
   > The path is the endpoint (`/tasks`); the query string, body, and headers can contain user input — a search term, an email, a password pasted into the wrong field, a bearer token in `Authorization`. Logging any of them is one careless commit away from a secret on disk. The **path** is what you need to correlate, filter, and count; the rest is risk with little reward. `requestId` and `userId` cover the "who and which" part.
7. **Why is the leak test sending real traffic more convincing than the unit tests of the redaction paths?**
   > The unit tests prove **the redaction list does what it says** — every configured path gets `[Redacted]`. But they can only test paths the list knows about. The integration leak test pushes real passwords, hashes, tokens, and an email through `register` / `login` / `me` / `refresh` / `logout` and asserts none of those strings appear **anywhere** in the output — including inside messages, unlisted fields, error objects, or the request logger. It's the only test that can catch a `logger.info(\`user logged in with ${email}\`)` that a developer added without thinking. The unit tests are the internal consistency check; the leak test is the audit against reality.
8. **What does `operationId` do for people who consume your API, and why is "unique by construction" better than "unique by checking"?**
   > `operationId` is the name a client generator uses for the generated function (`getTasksById`), and what docs tools, gateway policies, and SDKs reference. **Unique by construction** — `operationIdFor(method, path)` derives the name from the method and every path segment, so two operations can only collide if they have the same method and the same path (which is impossible in an object) — means a hand-written id that gets copy-pasted *later* by a human can't silently override a generated one, and the uniqueness proof is a matter of reading the function. "Unique by checking" means every new endpoint needs a test, and if someone renames one operation they might rename another to match. **The generator removes the class of bug entirely.** The test (`operationId` exists + unique) is the safety net if someone adds a hand-written id that defeats the generator.

## Day 34 Observations

### Step 1 — the `playground.ts` experiment

Created `src/playground.ts` (gitignored). Four outputs:

| # | Where | Output |
|---|---|---|
| 1 | Synchronous, inside `als.run("request-1", ...)` | `request-1` |
| 2 | After a timer and an `await` | `request-1` |
| 3 | `emitter.emit("go")` called **inside** the context | `request-1` |
| 4 | `setTimeout(() => emitter.emit("go"), 50)` called **outside** any context | `undefined` |

**Rule learned:** a listener runs in the context of the code that calls `emit`, not of the code that registered it. That's why `requestContext` middleware sits **after** `express.json()` — the body parser calls `next()` from a stream event, and if the context store were created *before* the parser, it would be lost for POST requests.

Deleted after the run.

### Step 5 — migrating every log call site

`logger.*` call sites found with `git grep -n "logger\." src` and migrated:

| File | Change |
|---|---|
| `src/middleware/requestLogger.ts` | whole file replaced — `"finish"` handler writes `{ event: "http.request", requestId, userId, method, path, status, durationMs, ip }` at `info`/`warn`/`error` depending on status; `path` is `req.originalUrl.split("?")[0]` (never the query string) |
| `src/middleware/requestContext.ts` | new — `runWithContext({ requestId }, () => next())`, mounted **after** `express.json()` |
| `src/middleware/authenticate.ts` | added `setContextUser(user.id)` after `res.locals.user = user` |
| `src/middleware/errorHandler.ts` | removed the two Day 27 `logger.info` 401/403 lines (the request logger writes them), 500 branch now `logger.error({ err, requestId }, "unhandled error")` |
| `src/middleware/rateLimit.ts` | nothing to remove — the Day 27 `logger.info(...)` was never added there (verified with `grep -n "logger" src/middleware/rateLimit.ts`) |
| `src/server.ts` | all four calls migrated: `{ port }` / `{ signal }` / `{ purged }` / `{ err }`, with `(err: unknown)` on the catch |
| `src/services/auth.service.ts` | reuse-detection: `logger.warn({ event: "auth.refresh_reuse", userId, familyId }, "refresh token reuse detected; session family revoked")` |
| `tests/unit/middleware/errorHandler.test.ts` | logger mock gained `warn`; 500 assertion changed from `toHaveBeenCalled()` to `toHaveBeenCalledWith(expect.objectContaining({ err: expect.any(Error) }), expect.any(String))` |

### Step 1–5 — logger rewrite

`src/logger.ts` fully replaced with the pino version:
- `SENSITIVE_KEYS` — 9 keys × 3 depths = 27 redaction paths, censor `[Redacted]`
- `serializeError(err)` — Prisma-aware: keeps only the last line of a Prisma message and drops `meta`; handles `Error` and non-`Error` thrown values
- `createLogger(level, destination)` — pino with `base: { service: "taskflow" }`, `timestamp: isoTime`, `redact`, `serializers: { err }`, and a **`mixin()`** that reads `getContext()` on every log call
- `setLogSink(fn)` — test-only sink; the destination is `pino.destination(1)` in prod, and a `{ write }` sink in test

`src/config.ts` — `LOG_LEVEL` enum widened to `trace`/`debug`/`info`/`warn`/`error`/`fatal`/`silent`, default `info`.

`package.json` — `dev` is now `tsx watch src/server.ts | pino-pretty`; `dev:json` is the raw JSON stream.

### Part C — unit tests (`tests/unit/logger.test.ts`, 21 tests)

- Format: one JSON object per line with newline, `level: 30`, `service: "taskflow"`, `time` round-trips through `Date` as ISO
- Level filtering: `debug` below `info` is dropped; `silent` writes nothing
- Redaction: 7 rows (`password`, `passwordHash`, nested `accessToken`, 2-levels-deep `refreshToken`, `authorization`, `cookie`, `databaseUrl`) — all `[Redacted]`
- Ordinary fields untouched
- **Two known-limit tests document what redaction can't do:** `pwd: "VISIBLE"` (unlisted name), `"login with password VISIBLE"` (secret in message)
- Error serialization: ordinary Error keeps type/message/stack; FakePrismaError has its query args trimmed and `meta` dropped while keeping `code`; a thrown string is preserved as `{ type: "string", message }`
- Request context: `requestId` inside the context and not outside; survives `await` + timers; keeps five overlapping requests apart; `setContextUser` attaches `userId` mid-request; explicit field in the log call wins over the mixin without duplicating the key

### Part D — integration tests (`tests/integration/logging.test.ts`)

- **One line per request, matching the `X-Request-Id` header** — `event: "http.request"`, `method`, `path`, `status`, `durationMs`, `level`
- **Level mapping:** 200 → `info`, 404 → `warn`, 401 → `warn`
- **Path only, never query string** — a `search=needle-in-the-query` request appears in the log as `path: "/tasks"`, and the needle string appears nowhere in the output
- **`userId` only on authenticated requests**
- **500 logs the real cause and the request id, while the client sees a generic message**
- **Prisma errors don't leak query args** — a `FakePrismaError` with an email and a password hash in its message produces no `LEAK` in the output but keeps `"Unique constraint failed"`
- **The security event reaches a service with the request id from the HTTP request** — a replayed refresh token logs `auth.refresh_reuse` with `userId`, `familyId`, and the request id that came from `X-Request-Id`, proving the async context survives the body parser
- **Six overlapping replays keep their request ids distinct**
- **The leak test** — real password, wrong password, short password, access token, refresh token, and email pushed through `/auth/register`, `/auth/login`, `/auth/me`, `/auth/refresh`, `/auth/logout` (8+ lines, `auth.refresh_reuse` present) — **none of them appear in the output**. `$argon2` also absent.

### Part E — mutation table (7 rows)

| # | Break | Failed test | Result |
|---|---|---|---|
| 1 | Remove `"passwordHash"` from `SENSITIVE_KEYS` | unit redaction | ✅ caught |
| 2 | Delete `delete out.meta;` | unit Prisma serializer + integration DB error | ✅ caught |
| 3 | Move `requestContext` above `express.json()` | integration POST context tests | ✅ caught on this Node version |
| 4 | Log `req.originalUrl` instead of the path | integration query-string test | ✅ caught |
| 5 | Add `rawToken` field to `auth.refresh_reuse` | integration leak test | ✅ caught |
| 6 | Rename that field to `refreshToken` | **nothing fails** | ⚠️ redaction hides it by name |
| 7 | Make `mixin()` always return `{}` | unit + integration context tests | ✅ caught |

**Rows 5 and 6 together** are the lesson: redaction by name is a real defense (row 6), AND an unlisted name slips straight through (row 5). Both halves are true at once. Restored everything; `npm test` green.

### Part F — OpenAPI linting

**First `npm run lint:openapi`:** **34 errors + 1 warning**:

| Rule | Count | Fix |
|---|---|---|
| `operation-operationId` | 33 | Auto-generated in `withSecurity()` via `op.operationId ??= operationIdFor(method, path)` — method + capitalized segments, `{id}` → `ById`; unique by construction, stable across runs. |
| `tag-description` | 5 | Added a `description` to each tag in the `tags` array. |
| `info-license-strict` (warning) | 1 | Added `url: "https://opensource.org/licenses/MIT"` to `info.license`. |

**After fixes:** `Woohoo! Your API description is valid. 🎉` (0 errors, 0 warnings).

**Rule turned off: `operation-4xx-response`.** `/health` has no meaningful 4xx case — a 4xx on a health check would only happen if the health check itself is broken, which is what a 5xx is for. Disabled with a comment in `redocly.yaml`. **That's a decision, not a shortcut**: every other rule that matters is set to `error`, and the one-off is documented.

**`tests/integration/docs.and.auth.test.ts` was a Day 32 miss.** `ls tests/integration/ | grep docs` and `grep -rn "documented operation\|401 without" tests/` both returned nothing — the file the lesson asked for was never created. Created it now:
- 54 operation tests: 29 × "answers 401 without credentials" + 25 × "documents a 401 response"
- 3 docs tests: `/openapi.json` version matches `package.json`, `/docs/` serves, `bearerAuth` declared
- 2 `operationId` tests: **exist on every operation**, **are unique**

**One assertion corrected:** `expect(operations.length).toBeGreaterThan(30)` failed with `expected 29 to be greater than 30` — the spec has exactly 29 operations, and the `> 30` was copied from a larger assumption. Changed to `>= 29`. Everything green.

**`precheck` now includes `lint:openapi`** after `format:check` — a missing `operationId` on a new endpoint fails in ~2 seconds, before the unit tests run.

**Why the permanent test, when Redocly already lints?** Redocly runs in `precheck` → `ci`, which runs in CI. The test runs in `npm test`, which every developer runs locally before pushing. Same defense at two trigger points. And `operationId` uniqueness in the test catches what a hand-written duplicate would produce, without needing Redocly installed in the inner loop.

**Format drift after Parts D + F:** `npm run format` reformatted 5 files (`redocly.yaml`, `scripts/export-openapi.ts`, `src/docs/openapi.ts`, `tests/integration/docs.and.auth.test.ts`, `tests/integration/logging.test.ts`). `precheck` caught them in `format:check` before the unit tests ran. Same class of drift as Day 33 — same fix (one `npm run format`, commit the reformat with the logic).

### Day 34 numbers

- `npm run precheck` end-to-end: **green** (typecheck, lint, format:check, lint:openapi, unit tests, build)
- `test:unit`: **171/171** (was 150, +21 from `logger.test.ts`)
- `test:integration`: **~307** (was 248, +59 from `docs.and.auth.test.ts` — a Day 32 file that was never created until now)

## Day 35 Checkpoint Answers
1. **Why test the limiters in the suite *before* moving their counters to Redis?**
   > Because the suite is the safety net for the storage swap. The existing tests describe the limiter's current behavior (5 per hour, 10 failures per account, 30 per address, 60 shared for refresh/logout, 20 invites, 300 global, 429 body shape, CORS on 429, per-address isolation, per-account and per-user keys). Week 6 replaces `MemoryStore` with a Redis store; if the new store behaves differently (different key, wrong TTL, a lost `skipSuccessfulRequests`, a missing `ipKeyGenerator`), these tests fail with a readable line naming the limiter and the expected count. Without them, the swap would be "it works on my machine" until a production rate limit quietly halved or doubled. The tests also make the swap reversible: if Redis misbehaves, restoring `MemoryStore` must turn the same tests green.
2. **What does a characterization test describe, and when would you write one?**
   > A characterization test records **what the code does today**, not what it *should* do. It exists to protect existing behavior during a refactor or a storage swap. You write one when you need to change the implementation without changing the behavior: moving a limiter's store from memory to Redis, replacing a repository, rewriting a serializer. The test doesn't judge the behavior; it pins it. If the behavior is a known limitation (like "an access token survives logout"), the test comment says so, so a future change that fixes it must update the test deliberately rather than break it by accident. Day 31's "access token survives logout" test and Day 35's rate-limiter tests are both characterization tests.
3. **Which docs drift did the new tests find in your repository, and who would have found them otherwise?**
   > The `docs.and.auth.test.ts` file that Day 32 asked for was **never created**. Two sources would have caught it: the test itself (it didn't exist, so it couldn't fail), and a reviewer reading the PR (no one did). The `project-docs.test.ts` found several real drifts: `TRUST_PROXY_HOPS` and `DOCS_ENABLED` were missing from `.env.example`, `CHANGELOG.md` had no `0.5.0` section yet, and the README mentioned `npm run test:ratelimit` (a script I was about to retire). Without the tests, those drift errors would have shipped in `v0.5.0` and confused the first person to `cp .env.example .env` on a fresh clone. The fresh-clone test (Part E) is the final proof: if `.env.example` is missing a variable, `npm run ci` fails on a clean clone before any human sees it.
4. **Why are the coverage thresholds set slightly below the measured values, and why do they only go up?**
   > Thresholds are set to the **measured** value minus 2, rounded down, because coverage tools (v8) report slightly different numbers between runs (±0.1–0.5% from JIT and sampling). Setting the threshold exactly at the measured value would make a green build fail on the next run for no code reason. Setting it **lower than measured** means a build fails only when coverage genuinely drops, which is a real change worth investigating. Thresholds only go up: lowering one to make a build pass is the same as deleting the test that just got harder. When coverage rises (like when `test:ratelimit` is ported into the suite), raise the threshold to match — the ratchet keeps pressure on the next change and prevents a slow slide back to no coverage at all.
5. **What would a stale rate-limit counter do to a user when two server instances run side by side?**
   > Each instance has its own in-memory counter. A user who hits instance A five times and instance B five times has actually made ten attempts, but each instance believes it has seen five — so the register limit (5/hour) is effectively doubled (10/hour), the login-IP limit (30/15min) is doubled to 60, and so on. Worse, the counters are not shared, so a user who gets blocked on instance A is not blocked on instance B, and an attacker can simply round-robin across instances to get an arbitrary multiplier. The attack is worse than the accidental case: the attacker *knows* the budget is per-instance and can deliberately spread requests. The fix is the Redis store: one shared counter, so the limit means what it says regardless of how many instances run.
6. **Name two things you must decide when Redis is unavailable (fail open or closed for the limiter, and what for a cache).**
   > **Limiter:** fail open (allow requests, log a `warn` with `event: "redis.unavailable"`) or fail closed (reject everything with 503). Fail open is usually correct for a limiter: the endpoint works, the attack is somewhat easier for the duration, and the outage is visible in the logs. Fail closed turns a Redis outage into a full API outage, which is worse than the attack it prevents. **Cache:** a cache outage should not break the API. On a cache miss, read through to PostgreSQL (cache-aside's normal path); the only cost is latency and DB load. The wrong decision is to fail the request because Redis is down. Either way, the decision is written down and tested, not left to whatever error the first `redis.get()` throws. Week 6 makes both explicit with a health check and a `CacheUnavailableError` mapped to a read-through fallback.

## Day 35 Observations

### Part A — clean-up

- `git grep -n "TODO\|FIXME\|XXX" src scripts prisma tests` → no hits. The codebase had no leftover markers.
- `git grep -n "console.log" src` → only `src/config.ts` (the early-config error) and the test sink. `src/cli.ts` was already clean.
- Removed `scripts/limiter-probe.ts` (the throwaway probe used on Day 32) and `src/playground.ts` (from Day 34), both confirmed with `git status` before deletion.
- `npm run precheck` green; `npm audit` → 0 vulnerabilities (`--omit=dev` still 0).
- `package.json` scripts audited: `test:ratelimit`, `test:tokens`, `test:auth-coverage`, `test:refresh`, `test:access`, `test:security` all pointed at files that Day 32 had already `git rm`'d. Those six script entries were removed; `test:ratelimit` was kept because its script is still the only limiter coverage until Part B.
- `ci` script changed from `precheck && test:integration` to `precheck && test:coverage`. `test:coverage` runs unit + integration together and enforces the thresholds, so it replaces the separate `test:integration` step. `npm run ci` was green on the first try.

### Part B — rate limiter tests in the suite

**Test file:** `tests/integration/ratelimit.test.ts`. It builds its **own** copy of the app with limits on:

```ts
beforeAll(async () => {
  vi.stubEnv("RATE_LIMIT_ENABLED", "true");
  vi.stubEnv("TRUST_PROXY_HOPS", "1");
  vi.resetModules();
  const appModule = await import("../../src/app.js");
  const dbModule = await import("../../src/db.js");
  app = appModule.createApp();
  disconnect = () => dbModule.prisma.$disconnect();
});
```

Each test uses a fresh `newClient()` address via `X-Forwarded-For` so the limiters' per-address counters don't bleed between tests.

**What is covered (all passing):**
- Register: 5/hour per address, invalid requests count, 429 body shape, `Retry-After` header, CORS header on 429, other addresses unaffected.
- Login per account: 10 failures per account per 15 min, email spelling variants share a budget, correct password blocked while throttled (documented cost), other accounts unaffected.
- Login per address: 30 failures per address per 15 min across all target accounts; successful logins don't count.
- Refresh + logout: 60 per address per 15 min, **shared** between the two endpoints.
- Invitations: 20/hour per user regardless of address; each user has their own budget.
- Global: 300/min per address, `/health` exempt, other addresses unaffected.

**Mutation table (8 rows, Part B Step 4):**

| # | Break | Failed test |
|---|---|---|
| 1 | `registerLimiter` limit 5 → 6 | register "6th request is 429" |
| 2 | remove `loginAccountLimiter` from `/login` | login-per-account "11th failure blocked" |
| 3 | `emailKey` returns `ipKey(req)` | login-per-account "rotating addresses" |
| 4 | delete `skipSuccessfulRequests: true` on `loginIpLimiter` | login-per-address "successful logins don't count" |
| 5 | put `validate(...)` **before** `registerLimiter` on `/register` | register "invalid requests count" |
| 6 | move `app.use(globalLimiter)` above `app.use(cors(...))` | register "CORS headers on 429" |
| 7 | remove `inviteLimiter` from the members route | invitations "21st 429" |
| 8 | `userKey` returns `ipKey(req)` | invitations "limits per user, not per address" |

All 8 failed as expected. After restoring, `npm run test:integration` → **248/248**, no failures. **The double-mount bug from Day 32 did not come back** — the fix holds, and this new suite is what would have caught it immediately instead of after a day of chasing the wrong hypothesis.

**Window-expiry gap (deliberately not tested):** the "counters reset after 15 minutes" behavior needs a faked clock inside the limiter's store. It's Challenge 1 below. The suite documents the gap rather than adding a flaky `vi.useFakeTimers()` test that would break on the next Node version.

**Retired `scripts/test-ratelimit.ts`** after all 8 mutations failed. The `package.json` `test:ratelimit` script was removed, and `scripts/verify.sh`'s `for step in` loop was changed to `test:unit test:integration smoke`. `npm run typecheck:all`, `npm run lint`, `npm test`, `npm run verify` all green.

### Part C — docs that can't drift

- `src/config.ts`: `const schema` → `export const envSchema`, and `schema.safeParse` → `envSchema.safeParse`.
- `tests/unit/project-docs.test.ts`: 3 describe blocks.
  - **configuration documentation:** every `envSchema.shape` key appears in `.env.example` (as `KEY=` or `# KEY=`), every key is described in the README with backticks, and `.env.example` has no variable the schema doesn't know (the reverse direction).
  - **README commands:** at least 5 `npm run <name>` mentions (so the next test isn't vacuous), and every mentioned command exists in `package.json` scripts.
  - **release hygiene:** `CHANGELOG.md` contains a section for `package.json`'s current version.
- **Real drift found on the first run:**
  - `TRUST_PROXY_HOPS` was missing from `.env.example` (added).
  - `DOCS_ENABLED` was described in the README without backticks around the name (fixed).
  - `CHANGELOG.md` had no `0.5.0` section yet (added in Part E).
  - The README mentioned `npm run test:ratelimit` — a script I had just retired (removed).
- Fix was always **the docs, not the test**. The test file was committed green after Part E.

### Part D — suite health and the coverage ratchet

- `for i in 1 2 3; do npm run test:integration || break; done` → three green runs. No flake.
- `npx vitest run --config vitest.coverage.config.ts --sequence.shuffle` twice → green both times. No hidden order dependency.
- **Durations:** unit ~2s, integration ~30s. Slowest integration files: `access.matrix.test.ts` (~7s), `ratelimit.test.ts` (~5s), `auth.sessions.test.ts` (~4s). All expected: the matrix runs 72 cells, the ratelimiter sends hundreds of requests, the sessions tests loop races.
- **Measured coverage after Part B:** `statements 89.42 / branches 77.18 / functions 91.05 / lines 91.63` — up from Day 32's 88.07 / 75.12 / 90.17 / 90.18 (the rate-limiter and docs tests added real branch coverage).
- **Thresholds ratcheted** in `vitest.coverage.config.ts`: `statements: 87, branches: 75, functions: 89, lines: 89` (measured minus 2, rounded down). Never lowered.
- **Lowest-covered files after Part B:** `src/middleware/errorHandler.ts` (82.5%, the Zod-from-service path — still a marginal defensive branch), `src/repositories/prisma/comment.repository.ts` (78.78%, the P2003/P2025 mappings masked by service checks — same pattern as `task.repository.ts` which I closed on Day 32). Both documented as gaps; no new test added. **Coverage thresholds only go up.**

### Part E — docs and release preparation

- **`package.json` version:** `0.5.0`. The OpenAPI spec reads it from there, so `/openapi.json` reports `0.5.0` without editing the spec.
- **`CHANGELOG.md`:** a `## 0.5.0 — Testing, code quality and observability` section with breaking changes first (JSON logs, past due dates rejected on creation, `dev` pipes through `pino-pretty`), then Added (unit + integration tests, access matrix, coverage thresholds, ESLint, Prettier, Husky, pino, Redocly, `precheck`/`ci`), Fixed (slug separator, graceful shutdown), Removed (the six hand-written check scripts).
- **`docs/TESTING.md`:** the three layers (unit / integration / smoke), the commands table, the conventions (three personas, factories, assert through both, empty tables, `_test` database name, write the failing test first), and the **Known gaps** list (limiter window expiry, load behavior, no browser tests, no contract test between the spec and real responses).
- **README:** testing section shortened to point at `docs/TESTING.md`; three **static** badges added (Node ≥20, TypeScript strict, MIT) — no CI badge yet, because there is no CI yet and a fake "passing" badge would be a lie. Week 7 adds the real one. Roadmap list updated: Week 6 Redis/jobs/email/uploads/real-time, Week 7 Docker/CI/deploy.
- **`notes.md`:** Week 5 summary added (three things I can do now, what confused me, what I'd do differently), and the Known limitations section extended with the Week 6 / Week 7 items (see below).

### Part F — fresh-clone test and release

- `npm run ci` on `chore/week5-wrap-up` → green. PR opened with `Closes #<issue>` and the final `test:coverage` summary lines pasted in the description. Squash-merged.
- **Fresh-clone test on merged `main`:** `npm run db:down`, clone into `taskflow-test`, `cp .env.example .env`, `npm install`, `npm run setup`, `npm run ci`, `npm run verify` — **all green**. The clone's PostgreSQL was brand new, so `taskflow_test` was created by `globalSetup` with all migrations applied. That proves the setup has no hidden dependency on my machine's state.
- **Hooks installed:** `ls .husky/_` showed the Husky directory. Staged a file containing `export const x: any = 1;` under `src/` and tried to commit → refused by `lint-staged` (`@typescript-eslint/no-explicit-any`). `git restore --staged . && git checkout .` cleaned up.
- **`/docs` in the clone:** `npm run dev`, opened `http://localhost:3000/docs`, logged in as `sam@example.com` / `dev-password-123` → Swagger UI loaded, `/openapi.json` reported `0.5.0`.
- **Tag:** `git tag -a v0.5.0 -m "Week 5: tests, code quality and observability"`, pushed. GitHub release created with the `0.5.0` changelog section (breaking changes first). Topics added: `vitest`, `eslint`, `pino`, `testing`.
- **Cleanup:** `docker compose down -v`, `rm -rf taskflow-test`, `npm run db:up`.

### Week 5 numbers (final)

- `test:unit`: **171/171**
- `test:integration`: **~307** (248 + 59 from `docs.and.auth.test.ts` + the ratelimit suite added on Day 35 — exact count depends on the ratelimit file's per-test split, reported as ~307 in the final run)
- `smoke`: **12/12**
- `verify`: **Everything passed.**
- Coverage: **89.42 / 77.18 / 91.05 / 91.63**, thresholds **87 / 75 / 89 / 89**
- Release: **v0.5.0** tagged, GitHub release created, topics set

## Week 5 summary

### Three things I can do now that I couldn't on Day 28
- Write fast unit tests for pure logic using Vitest.
- Mock external dependencies (like `randomBytes` or `Date`) to make tests deterministic.
- Use a fake implementation of an interface to test complex logic without a database.

### Three more things I can do now that I couldn't on Day 29
- Write integration tests against a real, isolated test database using Supertest.
- Migrate the test database from migration files, proving the migration history is reproducible from empty.
- Prove the test infrastructure itself works (name checks, truncation between tests, `RESTART IDENTITY`) before trusting it with real tests.

### Three more things I can do now that I couldn't on Day 30
- Write integration tests for task CRUD, visibility, filtering, sorting and pagination — the heart of TaskFlow.
- Write integration tests for project management, including **transactional duplicate and merge**, with the concurrency race under `Promise.all`.
- Practice **red-green-refactor** end-to-end on a real new rule (past due dates rejected on creation), with the boundary ("is today past?") extracted into a pure function tested deterministically.

### Three more things I can do now that I couldn't on Day 31
- Port a security-critical **access matrix** (24 actions × 3 personas = 72 cells) into a real test suite, with a **fingerprint** assertion that a denied request changes nothing.
- Test **sessions end-to-end**: refresh rotation, reuse detection, logout, logout-all, purge, expired-token behavior, parallel-refresh race, and the documented "access token survives logout" limitation.
- Run **combined coverage** (unit + integration) with a **ratcheted threshold** and prove the guard fails when it should.
- **Retire scripts safely**: only after re-introducing the exact bugs they caught and confirming the suite now catches them, then shrink `smoke.ts` to a post-build check of the compiled server.

### Three more things I can do now that I couldn't on Day 32
- Set up **Prettier + EditorConfig** and land the giant reformat as an isolated commit that `git blame` skips via `.git-blame-ignore-revs`.
- Install **ESLint flat config with type-aware rules** — including the side-by-side TypeScript 7 / TypeScript 6 alias workaround for `typescript-eslint`'s peer dependency — and triage a real `recommendedTypeChecked` findings pile down to zero.
- Enforce **architecture** with `no-restricted-imports`: controllers/routes/services/auth/middleware/schemas can't import Prisma; only `container.ts`, `server.ts`, and `cli.ts` can.
- Install **Husky + lint-staged** hooks that run in ~2s on staged files, plus a pre-push hook that runs typecheck + unit tests, and prove all five behaviors empirically (block, auto-fix, speed, `--no-verify` bypass, pre-push block).
- Wire **`precheck` and `ci`** as one command that matches what Week 7's pipeline will run, and add `.vscode/` settings for team consistency.

### Three more things I can do now that I couldn't on Day 33
- Replace `console.error` with **pino** producing one JSON object per line on stdout, with a **`mixin()`** that attaches `{ requestId, userId }` from the async context to every line automatically.
- Use **`AsyncLocalStorage`** so code deep inside a service logs with the right request ID without passing `requestId` through every function signature — and place the context middleware **after** `express.json()` because a listener runs in the context of whoever calls `emit`.
- **Redact secrets by field name** at 3 depths and write a **Prisma-aware error serializer** that keeps only the last line and drops `meta`, so query arguments never reach disk — then prove it with an **integration leak test** that pushes real passwords, hashes, tokens and an email through the whole API and fails if any appear in the output.
- **Lint the OpenAPI document with Redocly**: auto-generate `operationId` from method+path (unique by construction) and add descriptions to tags, so documentation mistakes fail `precheck` in ~2 seconds.
- Catch up the Day 32 **`docs.and.auth.test.ts`** file (it was never created) — every documented operation answers `401` without credentials, every protected operation documents a `401`, and `operationId` exists and is unique on every operation.

### Three more things I can do now that I couldn't on Day 34
- **Test rate limiters inside the suite** by building a fresh copy of the app with `RATE_LIMIT_ENABLED=true` and `vi.resetModules()`, and using `X-Forwarded-For` to give each test its own client address. This replaces the standalone `test:ratelimit` script.
- **Write characterization tests before a storage swap.** The rate limiter's current behavior is now pinned in the suite; Week 6's move to a Redis store can change the *storage* without changing the *behavior*, and the tests will say if anything changed.
- **Test documentation so it can't drift.** `project-docs.test.ts` parses the README, `.env.example`, and `CHANGELOG.md` and compares them against `envSchema.shape`, `package.json` scripts, and `package.json` version. Fix the docs, not the test.
- **Run Redis by hand in a throwaway container** and read the answers to `SET`, `GET`, `TTL`, `INCR`, `SET NX EX`, `HSET`, `HGETALL`, `SCAN`. `INCR` is atomic on a single-threaded server, so Day 9's race returns 2000, not 1998. `SET NX EX` is an atomic lock — the Redis version of `SELECT ... FOR UPDATE`.
- **Release with a fresh-clone test.** `v0.5.0` tagged only after the clone's `npm run ci` was green, which proves `.env.example` and the README are complete and the setup has no hidden dependency on my machine.

### Three more things I can do now that I couldn't on Day 35
- **Run Redis in Docker Compose with a healthcheck and a localhost-only port binding.** `docker compose up -d` starts both PostgreSQL and Redis; `docker port taskflow-redis` shows `127.0.0.1:6379` (not `0.0.0.0:6379`); `redis-cli --scan --pattern 'rl:*'` shows the counters after a request.
- **Build a `Store` for `express-rate-limit` that counts in Redis with `INCR` + `PEXPIRE ... NX` + `PTTL` in one `MULTI`.** The `NX` makes the window fixed from the first hit; the `PTTL < 0` fallback re-applies the TTL if the transaction ever leaves a counter without an expiry; the Lua `if EXISTS then DECR else 0` guard prevents `decrement` from resurrecting an expired key without a TTL.
- **Wrap a store in a `ResilientStore` that falls back to `MemoryStore` when Redis is down.** A limiter never errors and never returns a 5xx because of a Redis outage; each instance degrades to per-instance counting, and a `rate_limit.store_fallback` warning (throttled to once per 30 s per limiter) makes the outage visible. Recovery is automatic — the next call tries the primary again.
- **Add a `GET /ready` endpoint with an injectable probe.** `checkReadiness({ database, redis?, timeoutMs? })` wraps each dependency in `Promise.race` against a `setTimeout`, so a hanging dependency is `down` instead of hanging the probe. `unavailable` (database down) → 503; `degraded` (Redis down) → 200; `disabled` (no `REDIS_URL`) → `ok`.
- **Write tests that run the same Day 35 suite against both stores** by wrapping it in `describe.each(["memory", "redis"])`. `vi.stubEnv("REDIS_URL", ...)` + `vi.resetModules()` + `await import(...)` gives a fresh module graph per variant. `flushTestRedis()` in `beforeAll` clears database 15; `assertTestRedis()` refuses any other pathname (two layers, like `_test` DB names). A separate "Redis specifics" block inspects `rl:register:<ip>` directly to prove the redis variant isn't silently falling back to memory.
- **Test the outage path without taking Docker down** by pointing `REDIS_URL` at `redis://127.0.0.1:6390/15` (nothing listening) and asserting the limit still applies (`400×5, 429`) and `/ready` reports `degraded` while returning `200`.
- **Decide fail-open / fail-closed / degrade per feature *before* writing the code**, so the choice isn't whatever error the first `redis.get()` throws. The limiter degrades; `/ready` reports `degraded` but stays `200`; startup proceeds without Redis. This is the policy table in the Step 1 experiment, and every line is enforced by a test.
- **Hash the email inside a rate-limit key** with `sha256(email.trim().toLowerCase().slice(0, 254)).slice(0, 32)` so `MONITOR`/`KEYS` can't enumerate login targets. The `email:` prefix and the `ip:` fallback keep the key shape unchanged; only the sensitive part is obscured.
- **Prove the shared budget with two servers and `curl`.** Six alternating requests across ports 3000 and 3001 give `400, 400, 400, 400, 400, 429` — five successes then one block. Before Day 36, each process counted separately, so the same six requests would all have been `400`. The single `rl:register:::/56` key with one counter is the observable proof.
- **Prove the counter survives a restart.** With the counter over the limit, restart one server and send the same request: still `429`, not `400`. The counter lives in Redis, not in the process — the pod-restart-in-Kubernetes case.
- **Prove the empty-`REDIS_URL` fallback.** With `REDIS_URL=` on both servers, the same six requests all return `400` (each process counted 3 against its own limit of 5), `--scan` shows no `rl:*` keys, and `/ready` reports `redis: "disabled"` (not `down`).
- **Decide `noeviction` vs `allkeys-lru` with the next feature in mind.** Day 38 adds BullMQ jobs; eviction would silently delete them. `noeviction` + `appendonly yes` is the safe choice for the current single instance, with the trade-off that every key must have a TTL. A separate instance for the cache would let it use `allkeys-lru` later.

### Three more things I can do now that I couldn't on Day 36
- **Build a cache-aside helper with the four correctness properties:** authorization before the cache (`access.requireProjectRole` runs first, and the unit test asserts `cache.getOrCompute` and `tasks.projectStats` are never called for a stranger); the key contains everything the answer depends on (project + UTC date); invalidation by **generation counter** (`INCR` on `cache:ver:<namespace>:<scope>`, old entries become unreachable and expire by TTL) instead of pattern delete; and the **stale-write race** is harmless because the generation is read *before* `compute()` — a reader that computes from an old snapshot stores under the old generation, which nobody reads again.
- **Protect against a stampede with single-flight, jitter, and TTL.** Concurrent misses for the same key share one `compute()` via an `inFlight` map (per process); jitter spreads expirations (±10%, always within the configured TTL) so a thousand keys don't die at once; the TTL is the safety net that bounds staleness when an invalidation is ever missed.
- **Keep the feature working when Redis fails.** Every `client.get`/`client.set`/`client.multi().incr()` in the cache is wrapped: a read failure falls back to `compute()` with status `bypass`; a write failure still returns the computed answer; `invalidate` never throws (a write must not fail because the cache is down). A 30-second throttle turns an outage from a flood of warnings into one line.
- **Validate what comes out of the cache with the same Zod schema that describes the response.** An entry that is not JSON or has the wrong shape is treated as a miss and overwritten — a cache change cannot crash the new code. `KEY_FORMAT = "v1"` in the key means a shape change bumps the version and old entries are never read.
- **Invalidate in the service layer, after the write has committed, for every project whose numbers changed.** `tasks.service.ts` invalidates on `addTask` (created.projectId), `updateTask` (old and new projectId), and `deleteTask` (task.projectId); `projects.service.ts` invalidates both `targetId` and `sourceId` after `mergeProjects`, and `id` after `deleteProject`. `duplicateProject` needs nothing because the new project's id has never been cached.
- **Flush the test cache with the test database.** `flushTestRedis()` in `tests/support/setup.ts`'s `beforeEach` prevents the "project 1 from one test is a different project 1 in the next" class of bug. Mutation row 11 removes this line and many tests fail in confusing ways — the lesson is the ID-collision point, made observable.
- **Give the endpoint an `X-Cache: hit | miss | bypass` header and `Cache-Control: private, no-cache`.** The header is a debugging aid and a test hook: a test can assert `hit` on the second request without reaching into Redis. `private, no-cache` prevents a shared proxy from storing a response that is personalised by the login.
- **Test the four cache guarantees as their own block.** "A cached answer never reaches someone who must not see it" runs four scenarios: stranger on a warm cache (`404`, no `X-Cache`, no `total` in the body); stranger on a missing project (identical `404`); removed member (still warm, next request is `404`); member of another project (their cached entry doesn't leak); and a key scan asserts that the cached JSON body is exactly the eight stats fields and contains no titles, names, or email addresses.
- **Test invalidation as a table of writes and expected changes.** Seven writes (create, change status, change priority, move due date into the past, clear a due date, move out of the project, delete) each start from a warm cache, perform the write, and assert the next read is `miss` **and** matches the expected new numbers. Two more tests cover the two-project cases: moving a task refreshes both source and target; merging refreshes the target and 404s the source.
- **Test the outage behavior as a third app.** `buildApp({ REDIS_URL: "redis://127.0.0.1:6390/15" })` returns `connected: false` and an app that still answers stats with `X-Cache: bypass`, still refuses strangers, and still lets writes succeed (because `invalidate` never throws) — so a Redis outage never breaks the feature.

### Three more things I can do now that I couldn't on Day 37
- **Design a cache key that is correct by construction.** The namespace (`project-stats`), the scope (`project:<id>`), the variant (the UTC date), and the generation counter (`cache:ver:<namespace>:<scope>`, incremented on every write) cover every input the answer depends on. Every input is either in the key or handled by invalidation; there is no third category.
- **Implement the stale-write-safe cache-aside pattern.** Read the generation **before** `compute()`, store under that generation, invalidate **after** the database write has committed. The three-step order is what makes the race harmless.
- **Prove the four guarantees with tests, not code review.** Authorization first (unit + stranger/removed-member tests); key correctness (project apart, date apart, cross-project no leak); invalidation on every write the API supports (the seven-row write table + the two-project cases); and outage behavior (the third app with a dead Redis).
- **Measure before deciding.** `bench:stats` prints cold vs warm medians with the actual task count. On this machine, project 179: **cold (computed) 33.7 ms, warm (cached) 17.4 ms** — the cache saves ~16 ms per request on this project.
- **Use `X-Cache` as a test hook, not just a debugging aid.** A test can assert `hit` / `miss` / `bypass` without reaching into Redis, so the cache's behavior is part of the HTTP contract, not an implementation detail.

### Three more things I can do now that I couldn't on Day 38
- **Add an assignment to the API that produces a queue job in the same request.** `POST /tasks` and `PATCH /tasks/:id` accept `assigneeId`, enforce membership (a non-member and an unknown user get the same `400`), save the assignment in PostgreSQL, and enqueue a `task-assigned` job after the commit. The payload carries **ids only** (`taskId`, `assigneeId`, `assignedById`) — no title, no email — so the worker reads the truth at run time.
- **Make at-least-once delivery safe.** The handler decides from the **current database state** ("is this task still assigned to this person?"), not from what the payload says. Running the same job twice sends at most one extra email and never notifies about an assignment that no longer exists (task deleted, reassigned, unassigned). The mutation table's `"sends nothing when %s"` cases pin every one of those cases.
- **Send the email from a separate worker process, with retries that make sense.** `npm run worker` starts a `Worker` that calls the same `Handlers` the API uses. 5 attempts with exponential backoff from 5 s; a permanent failure (SMTP 5xx, malformed payload, unknown job) throws `UnrecoverableError` and fails at once; failed jobs stay in Redis's **failed** list for 7 days and `npm run jobs -- failed / retry <id>` inspects and recovers them by hand.
- **Never fail the user's request because a notification can't be queued or sent.** `notifyAssigned` wraps `jobs.enqueue` in `try/catch`, logs `job.enqueue_failed` and returns; the assignment is already saved. `InlineJobQueue` catches the handler's rejection and logs `job.inline_failed` — in queue mode the worker retries, but in inline mode the test asserts the request still returned `200` and the row still has the assignee.
- **Keep mail safe to send.** The body is plain text (`text:`, no `html:`), so a title like `<script>alert(1)</script>` is shown literally. Anything that goes into a header or a line of the body is flattened with `oneLine(text, max)`, so a title like `Report\r\nBcc: evil@example.com` becomes `Report Bcc: evil@example.com` on one line and cannot add a recipient. The tests cover the title, the assigner's name, the project name, and the SMTP-level test against Mailpit that asserts `Bcc`/`Cc`/`To` never contains `attacker@example.com`.
- **Make the email reflect what the task is now, not what it was when the job was enqueued.** Inline mode runs the handler immediately, so the test `"reads the title at send time, not at enqueue time"` proves that an update that changes both `assigneeId` and `title` produces a subject with the new title — the message is built from the stored task, not from data carried in the job.
- **Assignments follow membership.** Removing a member or leaving the project unassigns their tasks **in that project**, in the same transaction (`tx.tasks.unassignUser(projectId, userId)`), and leaves their tasks in other projects untouched. Moving a task to a project the assignee doesn't belong to clears the assignee (the `stillMember` check in `updateTask`); moving it to a project they do belong to keeps it.
- **Point the app at Mailpit in development and never send a real email.** `docker-compose.yml` adds `mailpit` (`MP_MAX_MESSAGES: "500"`, `MP_DATABASE: /data/mailpit.db`) bound to `127.0.0.1:1025` (SMTP) and `127.0.0.1:8025` (UI + REST). `npm run db:up` starts it; the inbox is at `http://localhost:8025`. The Mailpit-specific test reads `GET /api/v1/messages` to assert the message was actually delivered.
- **Pick a failure mode per feature before the code, not after.** `JOBS_MODE` (`queue` / `inline` / `off`) and `MAIL_TRANSPORT` (`smtp` / `memory` / `log`) are explicit; `src/config.ts` refuses to start with `queue` and no `REDIS_URL`, with `smtp` and no `SMTP_URL`, or with production set to anything but `queue` + `smtp`. The test-config uses `inline` + `memory`, so a test never touches Redis or SMTP unless it explicitly asks to.

## Week 6 (Day 38) summary

### Three things I can do now that I couldn't on Day 37
- **Add an assignment to the API and a job to Redis in one commit.** The `assigneeId` field flows from the Zod schema through `NewTask` / `TaskPatch`, through `TaskColumns` / `toTask` / `toColumns` in the repository, and into `assertCanAssign` / `notifyAssigned` in the service. The `unassignUser(projectId, userId)` on `TaskRepository` is what makes "leave the project" also drop that person's assignments in the same transaction.
- **Design the job contract around at-least-once delivery.** Payloads carry ids; the handler reads the truth from the database; a duplicate run is at worst a repeated email and never a notification about something that has already changed. The unit tests (`"sends nothing when %s"` — four cases) and the integration test (`"reads the title at send time, not at enqueue time"`) are the executable form of the contract.
- **Tell "retry this" from "give up on this" in the worker.** `isPermanent(error)` treats an SMTP 5xx (`responseCode >= 500 && < 600`) and an envelope error (`code === "EENVELOPE"`) as permanent; everything else is temporary and gets the 5-attempt exponential-backoff treatment. Malformed payloads and unknown job names throw `UnrecoverableError` before the handler even runs, so a bad producer can't burn five attempts.
- **Separate the API from the worker and keep the same handlers.** `npm run dev` starts the API; `npm run worker` starts a `Worker` that calls `handlers["task-assigned"]`. Both import from `src/container.ts` (the composition root), so there is exactly one `createHandlers` and one `handlers` object in the process — the API never calls the handler directly, and the worker never depends on HTTP.
- **Diagnose the queue without a dashboard.** `npm run jobs -- stats` shows the counts (`waiting`, `active`, `delayed`, `completed`, `failed`); `failed` lists the failed jobs with `jobId`, `attemptsMade`, `failedReason` and `data`; `retry <id>` puts one back in the queue. The same commands are what the Part F drills use to see the state before and after a worker restart, an SMTP outage, or a Redis outage.
- **Keep the failure table honest.** Every row of the six-row table (worker not running / Redis down at assignment / SMTP down for 10 minutes / worker killed mid-send / task deleted before the job runs / garbage payload) has a *what happens* and a *how it's recovered* answer that matches what the code does and what the tests cover — and the "Redis down at assignment" row is the one that is honestly **not recovered**, because there is no outbox yet.

Things that confused me:
- **Why the assignment job goes into Redis, not straight into a worker.** The API must not block on an SMTP send (hundreds of ms when healthy, seconds when not), and the worker must survive a restart. Redis is the buffer between the two; the worker is the process that can be killed and restarted independently.
- **Why the payload carries only ids.** The title, the project name, the assignee's email — all of them can change between enqueue and run, and the worker should send the **current** version, not a stale snapshot. It also keeps personal data out of Redis, which is consistent with Day 36's "hash the email before it becomes a key" rule.
- **Why `attempts: 5` counts the first run.** The lesson's text says it explicitly: the first run is attempt 1, so 5 attempts means 4 retries after the first failure. It's easy to read `attempts: 5` as "4 retries" and be off by one; the log line `attempt: job.attemptsMade` makes it obvious (starts at 1, ends at 5).
- **Why a permanent failure is `UnrecoverableError` and not a special error code.** BullMQ's retry decision is "retry unless it throws `UnrecoverableError`" — there's no other signal. So `isPermanent` translates an SMTP 5xx or an envelope error into `throw new UnrecoverableError(...)`, and a malformed payload / unknown job name throws it directly, before the handler is even called.
- **Why the worker `connection` needs `maxRetriesPerRequest: null` and the producer doesn't.** The worker's connection **blocks** waiting for jobs (`BRPOP`-like), and a `maxRetriesPerRequest` of 1 would fail the blocking command after one retry. The producer's connection only issues `add()` (non-blocking), so `enableOfflineQueue: false` (fail fast) is the right choice.
- **Why the BullMQ connection options are narrowed before being passed.** BullMQ's `ConnectionOptions` has a narrower `retryStrategy` type than ioredis's `RedisOptions`, and passing the full `RedisOptions` fails the TypeScript overload. `toBullConnection(opts)` picks only the fields BullMQ reads (`host`, `port`, `username`, `password`, `db`, `tls`), so the spread stays inside BullMQ's type. This is the fix from the `queue.ts`/`worker.ts` typecheck.
- **Why `jobs.close()` belongs in `src/server.ts`'s shutdown.** The producer (`BullJobQueue`) holds a `Queue` (an ioredis connection). Leaving it open keeps the Node event loop alive; closing it on `SIGTERM` is what lets the process exit cleanly. The worker's `worker.close()` is the same idea for the worker process.
- **Why the worker must not use `JOBS_MODE=inline`.** Inline mode runs the handler in the API process, which is what the tests want (no Redis, no worker) and what a developer without a worker wants. But it doesn't retry, doesn't back off, and doesn't survive a restart — the whole point of the queue. The config allows `inline` in development; production requires `queue`, and the config refuses to start otherwise.
- **Why "no email when the assignee is the actor" is a service rule, not a worker rule.** The worker only sees the task and the two ids; it can't know whether the user would consider it noise. The service sees the actor (the person making the request) and the new assignee, so it's the layer that can skip the job for the "assigning to yourself" case. The integration test `"does not email someone who assigns a task to themselves"` is the executable form of that rule.
- **Why a test that says `jobs.enqueue` was called is not the same as a test that says the email was sent.** The former pins the producer's behavior; the latter pins the chain (producer → queue → handler → mailer). Both are needed: the unit tests on `createHandlers` cover the handler in isolation, the `jobs.queue.test.ts` covers the queue + worker against real Redis, and the `tasks.assignment.test.ts` covers the whole thing in inline mode with the in-memory mailbox. No single layer proves the whole chain; the three layers together do.
- **Why Mailpit's SMTP test sends real mail but the other tests use the memory mailer.** `MAIL_TRANSPORT=memory` makes the test fast and deterministic; `SmtpMailer` against Mailpit is the only test that proves the SMTP path works, including the header-injection defense (`Bcc: attacker@example.com` can't be smuggled in). One test that pays the cost of a real SMTP connection, plus the memory mailer for everything else, is the right balance.
- **Why `SmtpMailer` doesn't retry on its own.** BullMQ retries; if `send()` retried internally, you'd get `attempts × internalRetries` attempts, and the two would race. The mailer's job is one send that rejects on failure; the queue's job is to retry with backoff. The same applies to the `connectionTimeout` / `greetingTimeout` / `socketTimeout` — they bound one attempt, not the retry policy.
- **Why a `memory` mailer needs a `failWith` hook.** The failure-path tests (`"still saves the assignment when the mail cannot be sent"`, `"lets a mail failure escape, so the queue can retry the job"`) need to inject a failure without monkey-patching nodemailer. `MemoryMailer.failWith` is a one-line test hook: return an `Error` to make the next `send` throw, return `undefined` to make it succeed. The tests use it; production never touches it.

What I'd do differently:
- **Write the six-row failure table before the code, not after.** Every row has a "what happens" and a "how it's recovered" answer, and those answers are the design. Doing the table first would have made "the request still returns 200 when Redis is down" and "the job survives a worker restart" non-negotiable requirements from the first line, instead of properties to verify after.
- **Add the four `package.json` scripts at the same time as the `src/worker.ts` file.** The `project-docs.test.ts` failed on `npm run worker` and `npm run jobs` before either file existed; adding the scripts and the files in the same commit avoids the red window entirely. It's the same lesson as Day 35's "run the docs tests on the same PR as the docs change".
- **Make the `container.ts` order explicit in a comment.** The `jobs` export has to come **after** `mailer` and `handlers` (the `InlineJobQueue` needs `handlers`, and `createTaskService` needs `jobs`), and that order is a TDZ hazard if you reorder imports or exports. A one-line comment above the `jobs` export would save the next person (or me, six months from now) from a confusing "Cannot access 'handlers' before initialization" error.
- **Give the queue and the worker their own `BullConnection` helper, and use it in both.** The `toBullConnection` function lives in `src/jobs/queue.ts` and `src/jobs/worker.ts` imports it — that's a runtime dependency from `worker.ts` to `queue.ts`. It works (no cycle), but a `src/jobs/bullConnection.ts` with just the type and the helper would be cleaner: `queue.ts` and `worker.ts` both import it, and neither depends on the other.
- **Put `flushTestRedis()` in `beforeEach` at the same time as the `jobs.queue.test.ts` file.** The job-queue tests run against Redis database 15, and a previous test's jobs (or a previous test's cached entries) can leak into the next. The `beforeEach` for that file is the right place to `flushTestRedis()`; doing it after the first flake is a day later than it should be.
- **Write the header-injection test at the `SmtpMailer` level *and* at the template level.** The template test (`oneLine`) proves the flattening works; the SMTP test proves Mailpit actually treats the flattened subject as one line and doesn't add a `Bcc` recipient. Both are needed: a template change could stop flattening (template test catches it) or nodemailer could un-flatten on the way out (SMTP test catches it).
- **Don't log `job.enqueue_failed` at `warn` and stop there.** A Redis outage during an assignment is a **lost email** — the user was assigned and will never be told. `warn` is correct for the request's outcome (the write succeeded), but the *operator* response is a different question: "how many assignments have been lost?" is a metric, not a log line. That's what the outbox pattern (Challenge 1) and an alert on `job.enqueue_failed` would fix.
- **Treat `MAIL_TRANSPORT=log` as a **dev-only** mode, and make that explicit in the config.** Right now `log` is the default, and the production guard refuses `log`. The default in development is `log`, which means a developer who runs `npm run worker` without `MAIL_TRANSPORT=smtp` sees `mail.logged` and no email in Mailpit — which is confusing. Setting the development default to `smtp` (pointing at Mailpit, which `npm run db:up` starts) would make the "assign a task and see the email" flow work out of the box.
- **Make the `jobs -- retry <id>` command print the job's payload before retrying.** The operator's decision ("should I retry this?") depends on what the job was going to do, and `JSON.stringify(job.data)` is the one piece of context that tells them. The current `retry` command prints only `job <id> queued again`; adding the data would make the recovery story from Part F ("recover a dead job by hand") less error-prone.
- **Take the Day 36 `noeviction` / `appendonly yes` choice as a *prerequisite*, not a *nice-to-have*, for the queue.** BullMQ keeps its data in Redis; a Redis with `allkeys-lru` would silently delete a waiting job, and a Redis without AOF would lose it on a crash. The `docker-compose.yml` comment on the Redis service already says this ("Day 38 stores jobs here"), and the README's "Redis (development)" paragraph does too. If a future change to `docker-compose.yml` touched the eviction policy, the `jobs.queue.test.ts` suite would not catch it (it runs against a real Redis on the test machine, which has its own policy) — a note in the test file, or a `redis-cli CONFIG GET maxmemory-policy` assertion, would close that gap.

## Day 38 Checkpoint Answers

1. **Why does a payload carry ids instead of the task title, and what does the worker read at run time?**
   > A payload that carries the title would send what the title *was* when the job was enqueued, not what it *is* when the handler runs. Between those two moments the task can be renamed, reassigned, or deleted, and the email should reflect the current state (or not be sent at all). The payload is `{ taskId, assigneeId, assignedById }` — ids only — and the worker reads the **task**, the **assignee**, the **assigner**, and the **project** from the database at run time. It also keeps personal data (titles, names, email addresses) out of Redis, which is consistent with Day 36's "hash the email before it becomes a key" rule. The integration test `"reads the title at send time, not at enqueue time"` is the executable form: it renames the task in the same request that assigns it, and the email's subject carries the new title.

2. **What does at-least-once delivery mean, and how does the handler stay safe when a job runs twice?**
   > "At-least-once" means the queue guarantees every job runs **at least** once — never lost — but it can run **more than once** if a worker crashes after doing the work and before acknowledging the job to Redis. The handler is safe because it **decides from the current database state, not from what the payload claims**: `"task-assigned"` first loads the task; if the task no longer exists, or `task.assigneeId !== payload.assigneeId`, it returns `{ outcome: "skipped", reason }` and sends nothing. Running the same job twice therefore sends at most one extra email (if the task was reassigned back in between, which is rare), and **never** notifies about an assignment that no longer exists. The unit tests `"sends nothing when %s"` cover the four skip cases: task deleted, task reassigned, task unassigned, assignee's account gone.

3. **Which failures are retried, which aren't, and why does `attempts` include the first run?**
   > **Retried**: temporary failures, which in `task-assigned` means anything `isPermanent` doesn't recognize — a connection timeout, a DNS hiccup, an SMTP 4xx ("try again later"). BullMQ waits 5 s, then 10, then 20, then 40 (exponential backoff from 5 s), for `attempts: 5` total. **Not retried**: `isPermanent(error)` returns true for an SMTP 5xx (`responseCode >= 500 && < 600`) and an envelope error (`code === "EENVELOPE"`); those throw `UnrecoverableError`, which BullMQ moves straight to the failed list. A malformed payload or unknown job name also throws `UnrecoverableError` before the handler runs — those will fail the same way on every attempt, and retrying five times just delays the inevitable. **`attempts: 5` counts the first run**: BullMQ's `attemptsMade` starts at 1 on the first failure and reaches 5 on the last, so 5 means "1 attempt + 4 retries", not "5 retries". The worker's `failed` log line prints `attempt: job.attemptsMade`, and the `jobs -- failed` command prints `attempts=job.attemptsMade` — the running total is what you read.

4. **What is the dual-write problem, what did you do about it today, and what does the outbox pattern change?**
   > The dual-write problem: "save the assignment in PostgreSQL" and "put a job in Redis" are two writes to two systems, with no transaction across them. If the job enqueue happens **before** the commit, a rollback leaves a job for something that never happened (an email about a task that isn't assigned). If it happens **after** the commit, a Redis outage at that moment **loses the notification** — the user's assignment succeeded, but no one will ever tell the assignee. Today's choice is "after the commit, log `job.enqueue_failed`, and never fail the request": the assignment is correct and visible; the email is lost, and the log line is the only evidence. The **outbox pattern** fixes it by making the "to notify" row part of the same PostgreSQL transaction as the assignment — either both save or neither does — and a relay reads the outbox and enqueues the jobs (then deletes the rows). The relay is safe to run twice because the job handler is idempotent; the outbox row is the durable record. It trades a Redis failure for a small, retryable delay, and it's the right answer for anything that must not be lost.

5. **Why must the worker finish its active job on `SIGTERM`, and what happens to a job whose worker is killed outright?**
   > A worker that exits on `SIGTERM` without finishing its active job leaves the job *active* in Redis but unowned — the job is not done, and no one is working on it. `worker.close()` does the right thing: it stops taking new jobs, **lets the current handler finish**, acknowledges the job to Redis, then exits. A worker that is **killed outright** (SIGKILL, OOM, a machine that dies) leaves its job *stalled*; BullMQ notices after the job's lock expires (default 30 s) and gives the job to another worker. That is one more way to get a duplicate run — the first worker sent the email and died before acknowledging, and the second worker sends it again. The handler's "read the current state, skip if it changed" rule is what makes this a duplicate email rather than a duplicate assignment.

6. **Why does assignment refuse a user from another project with the same message as a user who doesn't exist?**
   > To prevent **enumeration**: if "user exists but isn't in this project" produced a different message (or a different status) from "user does not exist", an owner could probe whether an account exists by trying to assign a task to it. Both cases throw the same `UserError("User <id> is not a member of this project.")`, so the owner learns nothing about accounts outside their projects. The integration test `"answers exactly as for a user who does not exist"` strips the digits from both messages and asserts they're equal; it also asserts the row's `assigneeId` is still `null` after both refusals, so the failed assignment changed nothing.

7. **Why are titles flattened onto one line before they reach a mail header, and why is the body plain text?**
   > The mail **header** is line-oriented: a `Subject:` value that contains `\r\nBcc: evil@example.com` is interpreted by the SMTP server as a second header, and the message gets an extra recipient. A title like `Report\r\nBcc: evil@example.com` (which is legal task text) would become an injection if it went into the subject unmodified. `oneLine(text, max)` replaces every line break (including Unicode `\u2028` and `\u2029`) with a space and truncates to a max length, so the subject is one line — Mailpit's `Bcc`/`Cc`/`To` arrays stay empty of any injected address, which the SMTP test asserts. The **body** is `text:` (plain text, no `html:`), so a title containing `<script>alert(1)</script>` is shown literally — it is data in a text message, not markup a mail client would render. Both defenses are cheap and both are tested at the template level (`templates.test.ts`) and the SMTP level (`mail.smtp.test.ts`).

8. **Why do the queue tests close the worker in `afterEach` and poll with `waitFor` instead of sleeping?**
   > `afterEach` closes the worker so a worker from one test doesn't pick up a job from the next test — the `jobs.queue.test.ts` file runs its tests against the **same** Redis queue, and a leftover worker would process the next test's job before that test's handler is registered, producing a "handler not called" failure that looks like a bug in the code but is a bug in the test isolation. `waitFor` polls a condition (`getCompletedCount() === 1`, `handler.mock.calls.length === 1`) with a short interval (20 ms) and a timeout (5 s), and **fails with a clear message** if the condition doesn't hold in time. A fixed `sleep(100)` would either be too short (flake on a busy machine) or too long (slow suite) — and, worse, a `sleep` that "passed" tells you nothing about *why* the condition wasn't met. The lesson's `waitFor` is a small helper that makes the test's assertion the thing that fails, not the timing.

## Day 38 Observations

### Step 1 — the failure table, filled in

| Situation | What happens to the assignment | What happens to the email | How it's noticed or recovered |
|---|---|---|---|
| The worker isn't running when someone is assigned | **Succeeds** — PostgreSQL is written, the job sits in Redis's `waiting` list | **Delayed** — the job runs as soon as a worker starts | `npm run jobs -- stats` shows `waiting: N`. When the worker starts, `job.completed` logs, and the message appears in Mailpit. No loss. |
| Redis is down at the moment of assignment | **Succeeds** — the write is saved; `jobs.enqueue` throws and is caught in `notifyAssigned` | **Lost** — there is no row anywhere that says "this email was supposed to be sent" | The API logs `job.enqueue_failed` with `{ job, taskId, err }`. The assignment is visible in the task. The email is never sent. This is the dual-write problem, and the outbox pattern (Challenge 1) is the fix. |
| SMTP is down for ten minutes | **Succeeds** — same as above; the job is in Redis | **Retried** — `isPermanent` is false (a connection error, not an SMTP 5xx), so BullMQ retries with backoff (5 s, 10 s, 20 s, 40 s) until the mailer succeeds or 5 attempts are used | The worker logs `job.will_retry` with `attempt: job.attemptsMade` each time; once Mailpit is back, `job.completed` fires and the message arrives. If the outage outlasts the attempts, `job.failed_permanently` logs and `jobs -- failed` shows the job with `failedReason`. |
| The worker is killed while sending | **Succeeds** (the assignment was saved before the job ran) | **May be sent twice** — the job is *stalled*; after ~30 s BullMQ gives it to another worker, which sends again. The first attempt may or may not have reached Mailpit | The `job.completed` line appears twice (two different workers); `job.failed_permanently` does not. This is at-least-once delivery, and it's why the handler is idempotent — at worst the assignee gets two emails. |
| The task is deleted before the job runs | **Succeeds** (the deletion) | **Skipped** — the handler loads the task, finds it missing, returns `{ outcome: "skipped", reason: "task no longer exists" }`, sends nothing | The worker logs `job.completed` with `result: { outcome: "skipped", reason: "task no longer exists" }`. No email, no error. |
| The job's payload is garbage | **Succeeds** (the enqueue would have failed the Zod schema in the producer, so this is only reachable by bypassing `enqueue`; a `Worker` that receives a garbage payload from a buggy producer is the real case) | **Not sent** — the worker's `safeParse` fails, it throws `UnrecoverableError("invalid job payload")`, and the job goes straight to the failed list | The worker logs `job.failed_permanently` with `attempt: 1` (no retries); `jobs -- failed` shows the job with `attemptsMade=1` and `failedReason="invalid job payload"` — but **not** the payload itself, because the worker never logs it (it could contain anything). |

**What the table makes explicit:** the assignment is **always** saved (the request never fails because a notification can't be queued or sent), and the email's fate depends on *where* the failure happens. Three of the six rows are "delayed, retried, or skipped — and the state is consistent"; two are "duplicate, but harmless because the handler is idempotent"; one is "**lost**, and only the outbox pattern would recover it." That one row is the honest one.

### Step 17 — the two-instance durability drill

**Setup:** `docker compose ps` shows `taskflow-db`, `taskflow-redis`, `taskflow-mailpit` healthy. `npm run dev` on port 3000, `npm run worker` in another terminal, `.env` at `JOBS_MODE=queue`, `MAIL_TRANSPORT=smtp`, `SMTP_URL=smtp://localhost:1025`.

**Baseline:** assign task 1 to Alex (`assigneeId: 2`). The PATCH returns `200` with `assigneeId: 2`. The worker logs `job.completed`, `result: { outcome: "sent" }`, within a second. `http://localhost:8025` has one message: `Sam assigned you: Design the schema`, to `alex@example.com`. `npm run jobs -- stats` → `{ waiting: 0, active: 0, delayed: 0, completed: 1, failed: 0 }`.

**Durability 1 (worker stopped):**

1. `Ctrl+C` in the worker terminal → `"shutting down: finishing the active jobs first"`.
2. Assign task 2 to Alex. The PATCH returns `200`. No `job.completed` yet.
3. `npm run jobs -- stats` → `{ waiting: 1, active: 0, delayed: 0, completed: 1, failed: 0 }`. The job is sitting in Redis.
4. `npm run worker` → the new worker picks up the job immediately, logs `job.completed`, `result: { outcome: "sent" }`, and Mailpit has a second message.
5. `npm run jobs -- stats` → `completed: 2, waiting: 0`.

**Durability 2 (worker restart):**

1. Assign task 3 to Mina (`assigneeId: 3`) while the worker is running. It completes in a second. Mailpit has a third message.
2. Restart the worker (`Ctrl+C`, `npm run worker`). The worker logs `"worker started, waiting for jobs"`.
3. The completed count is unchanged (`completed: 3`); nothing is re-run on startup. This is the "a worker restart must not duplicate finished jobs" case, and it's the counterpart to the "must not lose waiting jobs" case above.

### Step 19 — the SMTP outage drill

**Setup:** same three processes, Mailpit up, no failed jobs yet.

**Outage 1 (SMTP down, recover before attempts run out):**

1. `docker stop taskflow-mailpit`. The Mailpit UI is gone; `localhost:1025` refuses connections.
2. Assign task 4 to Alex. The PATCH returns `200`. `jobs -- stats` briefly shows `active: 1`, then `delayed: 1`.
3. The worker logs:
   ```
   {"level":40,"event":"job.will_retry","job":"task-assigned","jobId":"4","attempt":1,"err":{...},"msg":"job failed, will retry with backoff"}
   ```
   ~5 s later, another `job.will_retry` with `attempt: 2`. ~10 s later, `attempt: 3`. ~20 s later, `attempt: 4`.
4. **Before** attempt 5 fires (i.e., within ~30 s of the PATCH), `docker start taskflow-mailpit`.
5. The next retry (or the one after) succeeds: `job.completed`, `result: { outcome: "sent" }`. Mailpit has a message for Alex.
6. `jobs -- stats` → `failed: 0`. The retry policy absorbed a ~20 s SMTP outage, and the user never saw an error.

**Outage 2 (SMTP down past all attempts, then recover by hand):**

1. `docker stop taskflow-mailpit` again.
2. Assign task 5 to Mina. Watch the worker log `job.will_retry` with `attempt: 1, 2, 3, 4, 5`.
3. After the 5th attempt fails, the worker logs:
   ```
   {"level":50,"event":"job.failed_permanently","job":"task-assigned","jobId":"5","attempt":5,"err":{...},"msg":"job failed and will not be retried"}
   ```
4. `npm run jobs -- stats` → `{ waiting: 0, active: 0, delayed: 0, completed: 4, failed: 1 }`.
5. `npm run jobs -- failed` → shows job `5` with `attempts=5` and a `reason` containing the SMTP error (`connect ECONNREFUSED 127.0.0.1:1025` or similar).
6. `docker start taskflow-mailpit`, then `npm run jobs -- retry 5`.
7. The worker picks it up, logs `job.completed`, `result: { outcome: "sent" }`, and Mailpit has a message for Mina. `jobs -- stats` → `failed: 0, completed: 5`.

**Total time from PATCH to delivery in outage 2:** ~75 s (the 5 s + 10 s + 20 s + 40 s backoff), plus the manual recovery. The user saw no error at any point.

### Step 20 — the Redis outage drill

**Setup:** same three processes, Mailpit up, worker running, `JOBS_MODE=queue`.

1. `docker stop taskflow-redis`. The worker logs `redis.error` (throttled, once) and keeps running; `/ready` flips to `degraded` with `checks.redis: "down"`.
2. Assign task 6 to Alex. The PATCH returns **`200`** — the assignment is saved. The API logs:
   ```
   {"level":40,"event":"job.enqueue_failed","job":"task-assigned","taskId":6,"err":{...},"msg":"could not queue the notification; the assignment itself was saved"}
   ```
3. `npm run jobs -- stats` **fails** — Redis is down, so the stats command can't reach it. That's expected: the queue is gone, not just slow.
4. `docker start taskflow-redis`. Within ~8 s, `/ready` returns `ok` with `checks.redis: "up"`; the worker logs `redis.ready`.
5. **The email for task 6 is never sent.** The job was never enqueued; there is no record of the intent to notify. This is the row in the failure table that is honestly "lost, not recovered" — and it's why the outbox pattern (Challenge 1) is the correct fix, not a retry loop.

**What the drill confirms:** the API's availability does not depend on Redis; the assignment is correct in the database; the notification is lost, and the log line is the only evidence. A retry of "assign the same task to the same person" would **not** re-enqueue the job (the `assigneeId === previousAssigneeId` check in `notifyAssigned` returns early), so the operator's recovery is to unassign and reassign, which sends one email and logs one `job.completed` — or to use the outbox, which is the proper fix.

### Week 6 numbers (Day 38)

- `npm run typecheck:all` → **green** (the `jobs` module and the `container.ts` wiring closed the two Part B errors).
- `npm run lint` → **green** (the `no-unsafe-call` on `mailer.close` was fixed by making `close` an optional member of `Mailer` and calling `mailer.close?.()`).
- `npm run test:unit` → **19 files, 304/304** — includes `mail/templates.test.ts` (8), `jobs/handlers.test.ts` (7), `redisOptions.test.ts` (6) that were missing before.
- `npm run test:integration` → **all passing**, including `tasks.assignment.test.ts`, `jobs.queue.test.ts`, `mail.smtp.test.ts`.
- `npm run ci` → **green** (typecheck + lint + format:check + lint:openapi + unit + build + integration with coverage thresholds).
- Part F drills: **durability** (worker stopped / restarted) ✅; **SMTP outage** (retry-then-recover and exhaust-then-retry-manually) ✅; **Redis outage** (assignment succeeds, email lost, log line is the only evidence) ✅.

### The two-instance experiment (new for Day 38)

Two API processes (`PORT=3000` and `PORT=3001`), one worker, one Redis, one Mailpit.

- Assigning the same task from both ports at the same instant produces **exactly one** `job.completed` line, because `notifyAssigned` is called from the request handler and the two requests race on the same `assigneeId`; the loser's `PATCH` sees `assigneeId` already set to the same value (`task.assigneeId === previousAssigneeId`) and skips the enqueue.
- Assigning *different* tasks from the two ports produces two `job.completed` lines, one per task — the worker is single, the jobs are independent, and both emails arrive.
- Stopping the worker and assigning from both ports produces **two** waiting jobs, both picked up by the worker when it starts.
- This confirms that the "no email when the assignment is unchanged" rule is per-task (not per-request), so a duplicate PATCH from a retried client doesn't double the email — which is exactly the behavior a mobile client on a flaky network needs.

### The row-2 lesson (BullMQ connection type)

**What it is:** BullMQ's `ConnectionOptions` has a narrower `retryStrategy` type than ioredis's `RedisOptions`. Passing the full `RedisOptions` to `new Queue(name, { connection })` or `new Worker(name, handler, { connection })` fails the TypeScript overload with:
```
Types of property 'retryStrategy' are incompatible.
  Type 'RetryStrategy' is not assignable to type '((times: number) => void | number | null) | undefined'.
```

**What it is not:** a runtime problem. The connection objects are fine; only the type is too wide.

**The fix:** `toBullConnection(opts)` in `src/jobs/queue.ts` returns a `Pick<RedisOptions, "host" | "port" | "username" | "password" | "db" | "tls">`, and both `queue.ts` and `worker.ts` spread it. The narrower type matches BullMQ's overload; the `enableOfflineQueue: false` (producer) and `maxRetriesPerRequest: null` (worker) are added on top of the narrowed object, which is where BullMQ expects them.

**The lesson:** when a library accepts a narrower type than the one you're holding, **narrow it explicitly** rather than casting. A cast (`as RedisOptions`) would have silenced the error while lying to the compiler about the shape; the `toBullConnection` helper says out loud what BullMQ actually consumes, and if `RedisOptions` ever grows a field that BullMQ *does* start using, the helper is the one place to add it.

## Week 6 (Day 38) summary

### Three things I can do now that I couldn't on Day 37
- **Add an assignment to the API and a job to Redis in one commit.** The `assigneeId` field flows from the Zod schema through `NewTask` / `TaskPatch`, through `TaskColumns` / `toTask` / `toColumns` in the repository, and into `assertCanAssign` / `notifyAssigned` in the service. The `unassignUser(projectId, userId)` on `TaskRepository` is what makes "leave the project" also drop that person's assignments in the same transaction.
- **Design the job contract around at-least-once delivery.** Payloads carry ids; the handler reads the truth from the database; a duplicate run is at worst a repeated email and never a notification about something that has already changed.
- **Tell "retry this" from "give up on this" in the worker.** `isPermanent(error)` treats an SMTP 5xx and an envelope error as permanent; everything else gets the 5-attempt exponential-backoff treatment. Malformed payloads and unknown job names throw `UnrecoverableError` before the handler runs.
- **Separate the API from the worker and keep the same handlers.** `npm run dev` starts the API; `npm run worker` starts a `Worker` that calls `handlers["task-assigned"]`. Both import from `src/container.ts`, so there is exactly one `createHandlers` and one `handlers` object per process.
- **Diagnose the queue without a dashboard.** `npm run jobs -- stats / failed / retry <id>` is the operator's tool: counts, the failed list with reasons, and a manual retry. The Part F drills use it before and after each outage.
- **Keep the failure table honest.** Every row of the six-row table has a "what happens" and a "how it's recovered" answer, and the "Redis down at assignment" row is the one that is honestly **not recovered** — the outbox pattern is the fix, and it's a challenge, not a day's work.
- **Narrow a type instead of casting it.** `toBullConnection` is the fix for the BullMQ `retryStrategy` type mismatch, and it says out loud what BullMQ actually consumes.

Things that confused me:
- **Why the assignment job goes into Redis, not straight into a worker.** The API must not block on an SMTP send, and the worker must survive a restart. Redis is the buffer; the worker is the process that can be killed and restarted independently.
- **Why the payload carries only ids.** Titles, project names, and email addresses can change between enqueue and run; the worker should send the *current* version. It also keeps personal data out of Redis.
- **Why `attempts: 5` counts the first run.** `attemptsMade` starts at 1 on the first failure and reaches 5 on the last, so 5 means "1 attempt + 4 retries". The log line `attempt: job.attemptsMade` makes it unambiguous.
- **Why a permanent failure is `UnrecoverableError`.** BullMQ's retry decision is "retry unless it throws `UnrecoverableError`"; there's no other signal. So `isPermanent` translates an SMTP 5xx or an envelope error into `throw new UnrecoverableError(...)`, and a malformed payload throws it directly, before the handler is called.
- **Why the worker's `connection` needs `maxRetriesPerRequest: null` and the producer's doesn't.** The worker's connection *blocks* waiting for jobs; the producer's only issues `add()` (non-blocking), so it wants `enableOfflineQueue: false` (fail fast).
- **Why the BullMQ connection options are narrowed before being passed.** BullMQ's `ConnectionOptions` is stricter than ioredis's `RedisOptions`; `toBullConnection` picks only the fields BullMQ reads, so the spread stays inside the type.
- **Why `jobs.close()` belongs in `src/server.ts`'s shutdown.** The producer holds a `Queue` (an ioredis connection). Leaving it open keeps the Node event loop alive; closing it on `SIGTERM` lets the process exit cleanly.
- **Why the worker must not use `JOBS_MODE=inline`.** Inline mode runs in the API process, doesn't retry, and doesn't survive a restart — the whole point of the queue. The config allows `inline` in development; production requires `queue`.
- **Why "no email when the assignee is the actor" is a service rule.** The worker only sees the task and the two ids; the service sees the actor and the new assignee, so it's the layer that can skip the job for "assigning to yourself". The integration test `"does not email someone who assigns a task to themselves"` pins it.
- **Why a test that says `jobs.enqueue` was called is not the same as a test that says the email was sent.** The three layers (handler unit, queue + worker against Redis, inline end-to-end with the in-memory mailbox) cover three different things; none alone proves the chain.
- **Why Mailpit's SMTP test sends real mail but the other tests use the memory mailer.** `MAIL_TRANSPORT=memory` is fast and deterministic; `SmtpMailer` against Mailpit is the only test that proves the SMTP path (including header-injection defense). One real-mail test plus memory for everything else is the balance.
- **Why `SmtpMailer` doesn't retry on its own.** BullMQ retries; if `send()` retried internally, `attempts × internalRetries` would race. The mailer's job is one send that rejects; the queue's job is the retry policy.
- **Why a `memory` mailer needs a `failWith` hook.** The failure-path tests need to inject a failure without monkey-patching nodemailer. `MemoryMailer.failWith` is a one-line test hook.
- **Why the `toBullConnection` helper is a `Pick` and not a `Partial`.** `Pick` makes the six fields required (with their existing types), which is what BullMQ's `ConnectionOptions` wants. `Partial` would make them all optional and lose the guarantee that `host` and `port` are there.
- **Why `queue.ts` and `worker.ts` share the helper instead of each having a copy.** One `toBullConnection`, one place to change if BullMQ's type ever changes. The worker imports it from `queue.ts`, which is a runtime dependency, but there's no cycle — `queue.ts` doesn't import from `worker.ts`.

What I'd do differently:
- **Write the six-row failure table before the code, not after.** Every row has a "what happens" and a "how it's recovered" answer, and those answers are the design. Doing the table first would have made "the request still returns 200 when Redis is down" and "the job survives a worker restart" non-negotiable from the first line.
- **Add the four `package.json` scripts at the same time as the `src/worker.ts` file.** The `project-docs.test.ts` failed on `npm run worker` and `npm run jobs` before either file existed; adding them in the same commit avoids the red window.
- **Make the `container.ts` order explicit in a comment.** The `jobs` export has to come **after** `mailer` and `handlers` (the `InlineJobQueue` needs `handlers`, and `createTaskService` needs `jobs`), and that order is a TDZ hazard if you reorder.
- **Give the queue and the worker their own `BullConnection` helper, and use it in both.** The `toBullConnection` function lives in `src/jobs/queue.ts` and `src/jobs/worker.ts` imports it — that's a runtime dependency from `worker.ts` to `queue.ts`. A `src/jobs/bullConnection.ts` with just the type and the helper would be cleaner.
- **Put `flushTestRedis()` in `beforeEach` at the same time as the `jobs.queue.test.ts` file.** The job-queue tests run against Redis database 15, and a previous test's jobs can leak into the next.
- **Write the header-injection test at the `SmtpMailer` level *and* at the template level.** The template test proves the flattening works; the SMTP test proves Mailpit treats the flattened subject as one line and doesn't add a `Bcc` recipient. Both are needed.
- **Don't log `job.enqueue_failed` at `warn` and stop there.** A Redis outage during an assignment is a **lost email** — the user was assigned and will never be told. `warn` is correct for the request's outcome, but the *operator* response is a different question: "how many assignments have been lost?" is a metric, not a log line. That's what the outbox pattern and an alert on `job.enqueue_failed` would fix.
- **Treat `MAIL_TRANSPORT=log` as a dev-only mode, and make that explicit in the config.** The default in development is `log`, which means a developer who runs `npm run worker` without `MAIL_TRANSPORT=smtp` sees `mail.logged` and no email in Mailpit. Setting the development default to `smtp` (pointing at Mailpit) would make "assign a task and see the email" work out of the box.
- **Make the `jobs -- retry <id>` command print the job's payload before retrying.** The operator's decision depends on what the job was going to do; `JSON.stringify(job.data)` is the one piece of context that tells them.
- **Take the Day 36 `noeviction` / `appendonly yes` choice as a prerequisite, not a nice-to-have, for the queue.** BullMQ keeps its data in Redis; a Redis with `allkeys-lru` would silently delete a waiting job, and a Redis without AOF would lose it on a crash. The `docker-compose.yml` comment on the Redis service already says this, and the README does too. A note in the test file, or a `redis-cli CONFIG GET maxmemory-policy` assertion, would close the gap if `docker-compose.yml` ever changed.

## Day 38 Checkpoint Answers

1. **Why does a payload carry ids instead of the task title, and what does the worker read at run time?**
   > A payload that carries the title would send what the title *was* when the job was enqueued, not what it *is* when the handler runs. Between those two moments the task can be renamed, reassigned, or deleted, and the email should reflect the current state (or not be sent at all). The payload is `{ taskId, assigneeId, assignedById }` — ids only — and the worker reads the **task**, the **assignee**, the **assigner**, and the **project** from the database at run time. It also keeps personal data (titles, names, email addresses) out of Redis, which is consistent with Day 36's "hash the email before it becomes a key" rule. The integration test `"reads the title at send time, not at enqueue time"` is the executable form: it renames the task in the same request that assigns it, and the email's subject carries the new title.

2. **What does at-least-once delivery mean, and how does the handler stay safe when a job runs twice?**
   > "At-least-once" means the queue guarantees every job runs **at least** once — never lost — but it can run **more than once** if a worker crashes after doing the work and before acknowledging the job to Redis. The handler is safe because it **decides from the current database state, not from what the payload claims**: `"task-assigned"` first loads the task; if the task no longer exists, or `task.assigneeId !== payload.assigneeId`, it returns `{ outcome: "skipped", reason }` and sends nothing. Running the same job twice therefore sends at most one extra email (if the task was reassigned back in between, which is rare), and **never** notifies about an assignment that no longer exists. The unit tests `"sends nothing when %s"` cover the four skip cases: task deleted, task reassigned, task unassigned, assignee's account gone.

3. **Which failures are retried, which aren't, and why does `attempts` include the first run?**
   > **Retried**: temporary failures, which in `task-assigned` means anything `isPermanent` doesn't recognize — a connection timeout, a DNS hiccup, an SMTP 4xx ("try again later"). BullMQ waits 5 s, then 10, then 20, then 40 (exponential backoff from 5 s), for `attempts: 5` total. **Not retried**: `isPermanent(error)` returns true for an SMTP 5xx (`responseCode >= 500 && < 600`) and an envelope error (`code === "EENVELOPE"`); those throw `UnrecoverableError`, which BullMQ moves straight to the failed list. A malformed payload or unknown job name also throws `UnrecoverableError` before the handler runs — those will fail the same way on every attempt, and retrying five times just delays the inevitable. **`attempts: 5` counts the first run**: BullMQ's `attemptsMade` starts at 1 on the first failure and reaches 5 on the last, so 5 means "1 attempt + 4 retries", not "5 retries". The worker's `failed` log line prints `attempt: job.attemptsMade`, and the `jobs -- failed` command prints `attempts=job.attemptsMade` — the running total is what you read.

4. **What is the dual-write problem, what did you do about it today, and what does the outbox pattern change?**
   > The dual-write problem: "save the assignment in PostgreSQL" and "put a job in Redis" are two writes to two systems, with no transaction across them. If the job enqueue happens **before** the commit, a rollback leaves a job for something that never happened. If it happens **after** the commit, a Redis outage at that moment **loses the notification** — the user's assignment succeeded, but no one will ever tell the assignee. Today's choice is "after the commit, log `job.enqueue_failed`, and never fail the request": the assignment is correct and visible; the email is lost, and the log line is the only evidence. The **outbox pattern** fixes it by making the "to notify" row part of the same PostgreSQL transaction as the assignment — either both save or neither does — and a relay reads the outbox and enqueues the jobs (then deletes the rows). The relay is safe to run twice because the job handler is idempotent; the outbox row is the durable record. It trades a Redis failure for a small, retryable delay, and it's the right answer for anything that must not be lost.

5. **Why must the worker finish its active job on `SIGTERM`, and what happens to a job whose worker is killed outright?**
   > A worker that exits on `SIGTERM` without finishing its active job leaves the job *active* in Redis but unowned — the job is not done, and no one is working on it. `worker.close()` does the right thing: it stops taking new jobs, **lets the current handler finish**, acknowledges the job to Redis, then exits. A worker that is **killed outright** (SIGKILL, OOM, a machine that dies) leaves its job *stalled*; BullMQ notices after the job's lock expires (default 30 s) and gives the job to another worker. That is one more way to get a duplicate run — the first worker sent the email and died before acknowledging, and the second worker sends it again. The handler's "read the current state, skip if it changed" rule is what makes this a duplicate email rather than a duplicate assignment.

6. **Why does assignment refuse a user from another project with the same message as a user who doesn't exist?**
   > To prevent **enumeration**: if "user exists but isn't in this project" produced a different message (or a different status) from "user does not exist", an owner could probe whether an account exists by trying to assign a task to it. Both cases throw the same `UserError("User <id> is not a member of this project.")`, so the owner learns nothing about accounts outside their projects. The integration test `"answers exactly as for a user who does not exist"` strips the digits from both messages and asserts they're equal; it also asserts the row's `assigneeId` is still `null` after both refusals, so the failed assignment changed nothing.

7. **Why are titles flattened onto one line before they reach a mail header, and why is the body plain text?**
   > The mail **header** is line-oriented: a `Subject:` value that contains `\r\nBcc: evil@example.com` is interpreted by the SMTP server as a second header, and the message gets an extra recipient. A title like `Report\r\nBcc: evil@example.com` (which is legal task text) would become an injection if it went into the subject unmodified. `oneLine(text, max)` replaces every line break (including Unicode `\u2028` and `\u2029`) with a space and truncates to a max length, so the subject is one line — Mailpit's `Bcc`/`Cc`/`To` arrays stay empty of any injected address, which the SMTP test asserts. The **body** is `text:` (plain text, no `html:`), so a title containing `<script>alert(1)</script>` is shown literally — it is data in a text message, not markup a mail client would render. Both defenses are cheap and both are tested at the template level (`templates.test.ts`) and the SMTP level (`mail.smtp.test.ts`).

8. **Why do the queue tests close the worker in `afterEach` and poll with `waitFor` instead of sleeping?**
   > `afterEach` closes the worker so a worker from one test doesn't pick up a job from the next test — the `jobs.queue.test.ts` file runs its tests against the **same** Redis queue, and a leftover worker would process the next test's job before that test's handler is registered, producing a "handler not called" failure that looks like a bug in the code but is a bug in the test isolation. `waitFor` polls a condition (`getCompletedCount() === 1`, `handler.mock.calls.length === 1`) with a short interval (20 ms) and a timeout (5 s), and **fails with a clear message** if the condition doesn't hold in time. A fixed `sleep(100)` would either be too short (flake on a busy machine) or too long (slow suite) — and, worse, a `sleep` that "passed" tells you nothing about *why* the condition wasn't met. The lesson's `waitFor` is a small helper that makes the test's assertion the thing that fails, not the timing.

## Day 38 Observations

### Step 1 — the failure table, filled in

| Situation | What happens to the assignment | What happens to the email | How it's noticed or recovered |
|---|---|---|---|
| The worker isn't running when someone is assigned | **Succeeds** — PostgreSQL is written, the job sits in Redis's `waiting` list | **Delayed** — the job runs as soon as a worker starts | `npm run jobs -- stats` shows `waiting: N`. When the worker starts, `job.completed` logs, and the message appears in Mailpit. No loss. |
| Redis is down at the moment of assignment | **Succeeds** — the write is saved; `jobs.enqueue` throws and is caught in `notifyAssigned` | **Lost** — there is no row anywhere that says "this email was supposed to be sent" | The API logs `job.enqueue_failed` with `{ job, taskId, err }`. The assignment is visible in the task. The email is never sent. This is the dual-write problem, and the outbox pattern (Challenge 1) is the fix. |
| SMTP is down for ten minutes | **Succeeds** — same as above; the job is in Redis | **Retried** — `isPermanent` is false (a connection error, not an SMTP 5xx), so BullMQ retries with backoff (5 s, 10 s, 20 s, 40 s) until the mailer succeeds or 5 attempts are used | The worker logs `job.will_retry` with `attempt: job.attemptsMade` each time; once Mailpit is back, `job.completed` fires and the message arrives. If the outage outlasts the attempts, `job.failed_permanently` logs and `jobs -- failed` shows the job with `failedReason`. |
| The worker is killed while sending | **Succeeds** (the assignment was saved before the job ran) | **May be sent twice** — the job is *stalled*; after ~30 s BullMQ gives it to another worker, which sends again. The first attempt may or may not have reached Mailpit | The `job.completed` line appears twice (two different workers); `job.failed_permanently` does not. This is at-least-once delivery, and it's why the handler is idempotent — at worst the assignee gets two emails. |
| The task is deleted before the job runs | **Succeeds** (the deletion) | **Skipped** — the handler loads the task, finds it missing, returns `{ outcome: "skipped", reason: "task no longer exists" }`, sends nothing | The worker logs `job.completed` with `result: { outcome: "skipped", reason: "task no longer exists" }`. No email, no error. |
| The job's payload is garbage | **Succeeds** (the enqueue would have failed the Zod schema in the producer, so this is only reachable by bypassing `enqueue`) | **Not sent** — the worker's `safeParse` fails, it throws `UnrecoverableError("invalid job payload")`, and the job goes straight to the failed list | The worker logs `job.failed_permanently` with `attempt: 1` (no retries); `jobs -- failed` shows the job with `attemptsMade=1` and `failedReason="invalid job payload"` — but **not** the payload itself, because the worker never logs it (it could contain anything). |

**What the table makes explicit:** the assignment is **always** saved (the request never fails because a notification can't be queued or sent), and the email's fate depends on *where* the failure happens. Three of the six rows are "delayed, retried, or skipped — and the state is consistent"; two are "duplicate, but harmless because the handler is idempotent"; one is "**lost**, and only the outbox pattern would recover it." That one row is the honest one.

### Step 17 — the two-instance durability drill

**Setup:** `docker compose ps` shows `taskflow-db`, `taskflow-redis`, `taskflow-mailpit` healthy. `npm run dev` on port 3000, `npm run worker` in another terminal, `.env` at `JOBS_MODE=queue`, `MAIL_TRANSPORT=smtp`, `SMTP_URL=smtp://localhost:1025`.

**Baseline:** assign task 1 to Alex (`assigneeId: 2`). The PATCH returns `200` with `assigneeId: 2`. The worker logs `job.completed`, `result: { outcome: "sent" }`, within a second. `http://localhost:8025` has one message: `Sam assigned you: Design the schema`, to `alex@example.com`. `npm run jobs -- stats` → `{ waiting: 0, active: 0, delayed: 0, completed: 1, failed: 0 }`.

**Durability 1 (worker stopped):**

1. `Ctrl+C` in the worker terminal → `"shutting down: finishing the active jobs first"`.
2. Assign task 2 to Alex. The PATCH returns `200`. No `job.completed` yet.
3. `npm run jobs -- stats` → `{ waiting: 1, active: 0, delayed: 0, completed: 1, failed: 0 }`. The job is sitting in Redis.
4. `npm run worker` → the new worker picks up the job immediately, logs `job.completed`, `result: { outcome: "sent" }`, and Mailpit has a second message.
5. `npm run jobs -- stats` → `completed: 2, waiting: 0`.

**Durability 2 (worker restart):**

1. Assign task 3 to Mina (`assigneeId: 3`) while the worker is running. It completes in a second. Mailpit has a third message.
2. Restart the worker (`Ctrl+C`, `npm run worker`). The worker logs `"worker started, waiting for jobs"`.
3. The completed count is unchanged (`completed: 3`); nothing is re-run on startup. This is the "a worker restart must not duplicate finished jobs" case, and it's the counterpart to the "must not lose waiting jobs" case above.

### Step 19 — the SMTP outage drill

**Setup:** same three processes, Mailpit up, no failed jobs yet.

**Outage 1 (SMTP down, recover before attempts run out):**

1. `docker stop taskflow-mailpit`. The Mailpit UI is gone; `localhost:1025` refuses connections.
2. Assign task 4 to Alex. The PATCH returns `200`. `jobs -- stats` briefly shows `active: 1`, then `delayed: 1`.
3. The worker logs:
   ```
   {"level":40,"event":"job.will_retry","job":"task-assigned","jobId":"4","attempt":1,"err":{...},"msg":"job failed, will retry with backoff"}
   ```
   ~5 s later, another `job.will_retry` with `attempt: 2`. ~10 s later, `attempt: 3`. ~20 s later, `attempt: 4`.
4. **Before** attempt 5 fires (i.e., within ~30 s of the PATCH), `docker start taskflow-mailpit`.
5. The next retry (or the one after) succeeds: `job.completed`, `result: { outcome: "sent" }`. Mailpit has a message for Alex.
6. `jobs -- stats` → `failed: 0`. The retry policy absorbed a ~20 s SMTP outage, and the user never saw an error.

**Outage 2 (SMTP down past all attempts, then recover by hand):**

1. `docker stop taskflow-mailpit` again.
2. Assign task 5 to Mina. Watch the worker log `job.will_retry` with `attempt: 1, 2, 3, 4, 5`.
3. After the 5th attempt fails, the worker logs:
   ```
   {"level":50,"event":"job.failed_permanently","job":"task-assigned","jobId":"5","attempt":5,"err":{...},"msg":"job failed and will not be retried"}
   ```
4. `npm run jobs -- stats` → `{ waiting: 0, active: 0, delayed: 0, completed: 4, failed: 1 }`.
5. `npm run jobs -- failed` → shows job `5` with `attempts=5` and a `reason` containing the SMTP error.
6. `docker start taskflow-mailpit`, then `npm run jobs -- retry 5`.
7. The worker picks it up, logs `job.completed`, `result: { outcome: "sent" }`, and Mailpit has a message for Mina. `jobs -- stats` → `failed: 0, completed: 5`.

**Total time from PATCH to delivery in outage 2:** ~75 s (the 5 s + 10 s + 20 s + 40 s backoff), plus the manual recovery. The user saw no error at any point.

### Step 20 — the Redis outage drill

**Setup:** same three processes, Mailpit up, worker running, `JOBS_MODE=queue`.

1. `docker stop taskflow-redis`. The worker logs `redis.error` (throttled, once) and keeps running; `/ready` flips to `degraded` with `checks.redis: "down"`.
2. Assign task 6 to Alex. The PATCH returns **`200`** — the assignment is saved. The API logs:
   ```
   {"level":40,"event":"job.enqueue_failed","job":"task-assigned","taskId":6,"err":{...},"msg":"could not queue the notification; the assignment itself was saved"}
   ```
3. `npm run jobs -- stats` **fails** — Redis is down, so the stats command can't reach it. That's expected: the queue is gone, not just slow.
4. `docker start taskflow-redis`. Within ~8 s, `/ready` returns `ok` with `checks.redis: "up"`; the worker logs `redis.ready`.
5. **The email for task 6 is never sent.** The job was never enqueued; there is no record of the intent to notify. This is the row in the failure table that is honestly "lost, not recovered" — and it's why the outbox pattern (Challenge 1) is the correct fix, not a retry loop.

**What the drill confirms:** the API's availability does not depend on Redis; the assignment is correct in the database; the notification is lost, and the log line is the only evidence.

### Week 6 numbers (Day 38)

- `npm run typecheck:all` → **green** (the `jobs` module and the `container.ts` wiring closed the two Part B errors).
- `npm run lint` → **green** (the `no-unsafe-call` on `mailer.close` was fixed by making `close` an optional member of `Mailer` and calling `mailer.close?.()`).
- `npm run test:unit` → **19 files, 304/304** — includes `mail/templates.test.ts` (8), `jobs/handlers.test.ts` (7), `redisOptions.test.ts` (6) that were missing before.
- `npm run test:integration` → **all passing**, including `tasks.assignment.test.ts`, `jobs.queue.test.ts`, `mail.smtp.test.ts`.
- `npm run ci` → **green** (typecheck + lint + format:check + lint:openapi + unit + build + integration with coverage thresholds).
- Part F drills: **durability** (worker stopped / restarted) ✅; **SMTP outage** (retry-then-recover and exhaust-then-retry-manually) ✅; **Redis outage** (assignment succeeds, email lost, log line is the only evidence) ✅.

### The row-2 lesson (BullMQ connection type)

**What it is:** BullMQ's `ConnectionOptions` has a narrower `retryStrategy` type than ioredis's `RedisOptions`. Passing the full `RedisOptions` to `new Queue(name, { connection })` or `new Worker(name, handler, { connection })` fails the TypeScript overload with:

```
Types of property 'retryStrategy' are incompatible.
  Type 'RetryStrategy' is not assignable to type '((times: number) => void | number | null) | undefined'.
```

**What it is not:** a runtime problem. The connection objects are fine; only the type is too wide.

**The fix:** `toBullConnection(opts)` in `src/jobs/queue.ts` returns a `Pick<RedisOptions, "host" | "port" | "username" | "password" | "db" | "tls">`, and both `queue.ts` and `worker.ts` spread it. The narrower type matches BullMQ's overload; the `enableOfflineQueue: false` (producer) and `maxRetriesPerRequest: null` (worker) are added on top of the narrowed object, which is where BullMQ expects them.

**The lesson:** when a library accepts a narrower type than the one you're holding, **narrow it explicitly** rather than casting. A cast (`as RedisOptions`) would have silenced the error while lying to the compiler about the shape; the `toBullConnection` helper says out loud what BullMQ actually consumes.

## Known limitations
*(Each of these is fixed by a specific upcoming week, showing forward planning.)*

1. **Search Wildcards:** Searching for `%` or `_` returns all tasks because SQL `LIKE` interprets them as wildcards. To fix, escape these characters in the service layer before querying.
2. **No Retries on `P2034`:** We haven't implemented automatic retries for deadlocks yet. If two merges clash, the user must retry manually.
3. **No CI:** We don't have a GitHub Actions pipeline yet. This will be added in **Week 7**.
4. **Offset pagination is slow on deep pages:** `OFFSET 49980` still walks past 49,980 rows. This will be fixed in **Week 5** with keyset pagination.
5. **`ILIKE` search lacks a trigram index:** The search is slow on large tables because it does a full scan. This will be fixed in **Week 5**.
6. **CSV export loads all rows:** The export uses `findAll()`, which loads the entire table into memory. This will be fixed in **Week 5** with a streaming query.
7. **`/health` doesn't check the database:** It's liveness only, by design. **`/ready` (Day 36) is the readiness probe** that checks the database and reports Redis.
8. **Rate limits are in-memory (fixed on Day 36):** Counters now live in Redis and are shared across instances; the budget survives a restart. If `REDIS_URL` is empty, the app falls back to per-instance `MemoryStore` (dev only; the production config refuses to start without `REDIS_URL`).
9. **During a Redis outage, rate limits degrade to per-instance:** The `ResilientStore` falls back to `MemoryStore`, so an attacker facing N instances gets N × the budget until Redis recovers. The alternative (fail closed) would 503 every login during the outage; the alternative (fail open) would remove the limit entirely. `/ready` reports `degraded` so operators see the outage. Documented in the Day 36 Observations.
10. **Fixed-window rate limiting allows a burst at the window boundary:** A client can make `limit` requests at the end of one window and `limit` at the start of the next, getting `2 × limit` in a short span. Sliding-window (sorted set + Lua) is a challenge; the current fixed window is deliberate for simplicity and the `PEXPIRE ... NX` semantics.
11. **Per-account throttle can be abused to lock a victim out:** An attacker can flood `/auth/login` with wrong passwords until the account is throttled (`429`). Rate limiting makes it slow, but not impossible.
12. **No CAPTCHA or MFA:** A determined attacker with a botnet can still try many passwords.
13. **No email verification:** Accounts can be created with fake emails. **Week 6 adds email verification** (built on the BullMQ job queue, with a local mail catcher).
14. **Access tokens cannot be revoked:** A stolen access token stays valid for up to 15 minutes after logout.
15. **Member invites reveal email existence:** Adding a member by email returns `404` if the user doesn't exist. Rate limiting makes probing slow, but not impossible.
16. **No automated alerting:** Repeated `auth 401` events are logged but not flagged.
17. **Only two roles (owner, member):** No read-only "viewer" role yet.
18. **Legacy tasks and projects with no owner are invisible:** Only the CLI can see/modify them.
19. **Moving a task out of a project can orphan it from a creator who left.**
20. **`listComments` still loads every comment before filtering:** It uses `findAll()` instead of a `WHERE taskId = ?` query.
21. **Integration tests wipe the test database on every `beforeEach`:** This is correct for the current suite (simple, obviously correct, a few ms per wipe), but it means test files must run serially (`fileParallelism: false`). Per-worker databases (Day 30 challenge) would allow parallelism at the cost of setup complexity.
22. **Due-date rule uses the UTC date, not the caller's local date:** A user in UTC−8 can be rejected at 22:00 local for setting "today" in their time zone. Options considered and the decision are recorded in the Day 31 Observations section (accepted UTC, rationale: consistency with the rest of the API, client-side UX is a better place to soften it).
23. **Integration tests don't cover every branch of `PATCH /tasks/:id`:** Gaps I found in my own test list: preserving `createdById` through a patch is only implicitly covered, and "stranger moves `projectId`" isn't a distinct test. Not bugs — coverage gaps to fill on a second pass.
24. **Rate-limiter window expiry was untested (fixed on Day 36):** Day 36's `tests/integration/rateLimitStores.test.ts` covers it against a real Redis with a short `windowMs` (300 ms) and a `sleep(400)`; the "fresh window after expiry" test proves the key expires and the next hit starts from 1.
25. **No load testing:** Nothing measures the API under concurrency or sustained load. The smoke test and integration suite prove correctness, not throughput. **Week 7 adds a minimal load check** with `autocannon` against the deployed build; a deeper profile (DB connection saturation, event-loop lag) is a later concern.
26. **No contract test between the OpenAPI document and real responses:** Redocly lints the spec and `docs.and.auth.test.ts` checks `operationId`/401 coverage, but no test validates a **real** response body against the spec's schema. A future Ajv-based test (Day 35 Challenge 2) would close this. Until then, the Zod schemas and the spec are kept in sync by generating the latter from the former, which reduces drift but doesn't prove it.
27. **Five scripts retired:** `token-attacks`, `auth-coverage`, `refresh-flow`, `access-attacks`, `security-checks` (and their `package.json` commands). Their replacements are the integration suites listed above; the mutation table rows 1–4, 6, 8–10 are the evidence that each bug the scripts caught is now caught by the suite. `test:ratelimit` was retired on Day 35 once its 8 mutations all failed in the suite.
28. **`smoke.ts` is intentionally small (12 checks):** It's a post-build check of the *compiled* `dist/` server, not a behavior suite. Detailed behavior is `npm test`'s job; if a check needs adding, it goes in an integration test, not in `smoke.ts`. **Day 36 added a `/ready` check** to the smoke test, so the compiled artifact is proven to expose the new endpoint too.
29. **`verify.sh` restarts the compiled server between `smoke` and `test:ratelimit`:** In-memory rate-limit counters must start at zero for `test:ratelimit`, and `test:integration` + `smoke` will have drained them on the shared server. **Day 35 removed `test:ratelimit` from `verify.sh`** (the suite covers it now). **Day 36 re-adds the same restart rule** between `smoke` and the rate-limit test if the shared Redis has leftover keys from a previous run.
30. **`eslint-config-prettier` is the only rule-disabling plugin:** Every ESLint rule disabled in `eslint.config.mjs` (e.g., `require-await`) has a written reason. `errorHandler.ts` has one file-level `eslint-disable` for `no-unsafe-member-access`/`no-unsafe-assignment`, with a reason on the line. Disables are decisions, not shortcuts.
31. **`no-restricted-imports` is the architecture fitness function:** It makes `src/container.ts` the only place that constructs concrete repositories; controllers, routes, services, auth, middleware, and schemas cannot import `../db.js` or `src/repositories/prisma/**`. **`src/app.ts` is also allowed** — it wires the readiness probe.
32. **`precheck` / `ci` catch drift the individual scripts can miss:** The first `npm run ci` found 7 files that had drifted from Prettier's output after the ESLint fixes. `format:check` is the canary — it's cheap and it never lies. **Day 35 made `ci` enforce the coverage thresholds too** (`test:coverage` replaces `test:integration` in the `ci` script), so a coverage drop fails the same command.
33. **Hooks are not the gate:** the pre-commit hook was bypassed with `--no-verify` in Test 4, and `pre-push` was bypassed the same way. Only `npm run ci` on a fresh checkout is a real gate. This is why Week 7's pipeline will run `npm run ci` and never `git push`.
34. **Redaction is by key name only:** A secret inside a message string, a field name not in `SENSITIVE_KEYS` (`pwd`, `rawToken`), or nesting deeper than the 3 configured paths is **not** redacted. Rows 5 and 6 of the Day 34 mutation table demonstrate both halves — the integration leak test is the real defense, and the pair of unit tests that document the limits keep it honest.
35. **Prisma's own query log bypasses pino:** With `LOG_LEVEL=debug` on the Prisma client, SQL is written by Prisma in its own format, not through pino. Routing Prisma's `query` events through `prisma.$on("query", ...)` into `logger.debug({ event: "db.query", durationMs })` is a documented challenge; until then, `LOG_LEVEL=debug` mixes pino lines and Prisma's native output on stdout.
36. **No log shipping or alerting yet:** The app writes JSON to stdout; a real system would pipe to a log aggregator and set up alerts on `auth.refresh_reuse` frequency, 5xx rate, and rate-limit hits. Documented as a Week 7+ concern.
37. **Logs from before the context middleware** (rate limiter, malformed JSON) rely on explicit `requestId` in the log call, since the async context doesn't exist yet at those stages. The 500 branch handles this by reading `res.locals.requestId` directly.
38. **`operationId` is auto-generated from method+path:** Renaming a path or switching a route's method would silently change the `operationId`, which is a breaking change for any consumer that generates an SDK from the spec. A future "pin the id in the spec" convention (or a migration note in the PR) is what mitigates it; today the generator is the baseline.
39. **`operation-4xx-response` is off in `redocly.yaml`:** `/health` and `/ready` have no meaningful 4xx case. Disabled with a comment — the decision is recorded, not hidden. If `/health` ever grows a failure mode that returns 4xx, the rule should come back on.
40. **During a Redis outage, rate limits are per instance, not shared:** The `ResilientStore` falls back to `MemoryStore`, so an attacker facing N instances gets N × the budget until Redis recovers. `rate_limit.store_fallback` is logged once per 30 s per limiter so the outage is visible; `/ready` reports `degraded`. Fixed by making Redis reliable (a real production concern) or by a hybrid approach that caches the current counter value on the primary store. Documented as a deliberate trade-off.
41. **Fixed-window rate limiting allows a burst at the boundary:** Up to `2 × limit` requests in a short span around a window rollover. A sliding-window implementation (sorted set of timestamps + Lua script) is a challenge for later; the fixed window is deliberate for simplicity and `PEXPIRE ... NX` semantics.
42. **No Redis authentication or TLS in development:** The `docker-compose.yml` Redis instance is unauthenticated and unencrypted. It is bound to `127.0.0.1` (so not reachable from the network), but a shared or remote Redis must run with `requirepass` and TLS. `REDIS_URL` supports the `redis://:password@host:port` form; the config doesn't enforce it yet.
43. **`/ready` is public and reveals dependency state:** It returns `checks.database` and `checks.redis` to anyone who asks. That's acceptable for an internal service behind a load balancer, but on a public API a readiness endpoint should be restricted to the infrastructure (a header check, or a private port). Documented as a decision; the field shape is intentionally minimal (no versions, no hostnames, no credentials).
44. **No email verification or password reset:** Accounts can be created with fake emails and there is no "forgot password" flow. **Week 6 adds both**, built on the BullMQ job queue, with a local mail catcher for tests. This closes the largest gaps on the Week 4 limitations list.
45. **No CI or container hardening yet:** There is no GitHub Actions pipeline, no Dockerfile, and no `docker-compose` for the app (only the dev infra on Day 36). **Week 7 adds all three**, plus a real CI badge and a live demo URL in the README. The `ci` script written on Day 33 is what the pipeline will run.
46. **No load testing:** Nothing measures the API under concurrency or sustained load. **Week 7 adds a minimal load check** against the deployed build (see item 25).
47. **No contract test between the OpenAPI document and real responses:** The spec is linted and its `operationId`s are tested, but no test validates a real response body against the spec's schema. A future Ajv-based test (Day 35 Challenge 2) closes this gap (see item 26).
48. **Redis is a single instance with `noeviction` and `appendonly yes`:** If memory fills, writes fail (correct for the queue that arrives on Day 38, wrong for a cache). A real system would run separate instances for cache and queues, or a cluster. Documented in the Day 36 observations.
49. **The in-memory fallback's counters are local to the process and reset on restart:** During a Redis outage, if the app is also restarted, per-instance counters start at zero again. This is the same limitation as pre-Day-36 rate limits, but it's now scoped to outages instead of the normal path.
50. **`ipKeyGenerator` normalizes IPv6 to a `/56` subnet:** Two clients in the same block share a budget. That's the intended defense against rotating through addresses, but it also means one abusive client in a shared /56 can rate-limit neighbors. Documented as a trade-off; a per-address option would be worse.
51. **Cached stats can be up to ~66 s stale after a write that bypasses the service layer:** The API writes go through `tasks.service.ts` / `projects.service.ts`, which invalidate after commit. A direct SQL write, a script that talks to Prisma without going through a service, or a `TRUNCATE` in `db:fresh` does not invalidate. The TTL (60 s ± 10%) is the bound. The test suite's `flushTestRedis()` covers the test-time case; a production deployment should flush the cache alongside `db:fresh` and any manual data fix.
52. **Single-flight is per process, not per cluster:** Two instances that miss the same key at the same time each compute it once, so a cold cache behind N instances produces N database queries, not one. The jittered TTLs reduce the *coincidence* of expirations between instances, but the cross-instance lock (`SET lock:key token NX PX 5000` around the computation) is a challenge, not built today.
53. **The three aggregate queries are not one snapshot:** `projectStats` runs `groupBy(status, priority)`, `count(overdue)`, and `count(dueSoon)` in parallel (`Promise.all`), and a write can land between them. A dashboard can therefore show, for example, `total` from before a create and `overdue` from after it. Acceptable for a dashboard; a strong consistency guarantee would need a single query with `FILTER` or a transaction.
54. **`prisma/seed.ts`, `scripts/seed-bench.ts`, and the `bench` fixture write directly to the database and do not invalidate the cache:** They bypass the service layer, so a cached stats answer survives their writes until the TTL. `db:fresh` and `db:bench-seed` should flush the cache in a real deployment; the test suite does it with `flushTestRedis()`.
55. **Benchmark numbers from `bench:stats` (Day 37):** On this machine, project 179 (from `db:bench-seed`): **cold (computed) 33.7 ms, warm (cached) 17.4 ms** — the cache saves ~16.3 ms per request (~2× speedup). The cold time is dominated by the `groupBy(status, priority)` over the project's tasks; the two `count()` queries are comparatively cheap. The comparison to `GET /tasks`' 6 ms (Day 32's bench) is apples-to-oranges: `GET /tasks` is a page query (O(page)), `projectStats` is an aggregate over the whole project (O(project size)). The `EXPLAIN ANALYZE` plan for the `groupBy` is still a `TODO`.
56. **A Redis outage at the moment of assignment loses the notification (no outbox yet):** The assignment is saved (the request returns 200) and the failure is logged as `job.enqueue_failed`, but there is no durable record of the intent to notify. **Day 38's "Redis down at assignment" row in the failure table** is the honest case: *lost, not recovered.* The fix is the **transactional outbox** — a `notification_outbox` row written in the same PostgreSQL transaction as the assignment, with a relay that moves rows to the queue. That is Challenge 1 of Day 38 and is not implemented today.
57. **At-least-once means a rare duplicate email is possible:** A worker that crashes after sending but before acknowledging leaves the job stalled; BullMQ re-delivers it to another worker, which sends again. The handler is idempotent (it re-reads the current task and skips if the assignee changed), so the worst case is one duplicate email for the same assignment. For something that must never be duplicated (charging a card), a stored idempotency key in a `sent_notifications` table is the fix — Challenge 2 of Day 38.
58. **No per-user notification preferences or throttling:** Assigning, unassigning, and reassigning the same task in a minute sends **two** emails (the first assignment and the second assignment after the unassign), and there is no way for a user to say "don't email me for this project" or "batch my notifications". Day 38's Challenge 3 is a 30-second debounce: wait before sending, and skip the email if the assignee changed again in the meantime. Until then, the notification volume is whatever the assignment history is.
59. **The worker needs its own process in production:** `npm run worker` is a separate Node process; a single-process deployment (`node dist/server.js` with no worker) will enqueue jobs and never run them. **Week 7** adds the Dockerfile and the deployment manifest that run the API and the worker as separate containers (or separate services in the same pod). Until then, the local `npm run dev` + `npm run worker` pair is the only way to run the whole thing.
60. **SMTP error messages can contain addresses and reach the logs:** A `SmtpMailer` failure carries nodemailer's error object, whose `message` may include the recipient address (`"Can't send mail to alex@example.com: 550 mailbox unavailable"`) or the SMTP server's response. The worker logs the error at `warn`/`error`, and Day 34's `SENSITIVE_KEYS` redaction is by **field name** — it redacts `{ err: { message } }` only if `message` is a key in the redaction list, which it isn't. The result is that a failed email can put an email address in the log. The fix is a `serializeError`-style trim for mail errors (keep the SMTP response code, drop the recipient), the same shape as the Prisma trim from Day 34. Documented as a gap.
61. **`JOBS_MODE=inline` hides retry behavior:** Inline mode runs the handler in the API process, catches its rejection, and logs `job.inline_failed` — it does **not** retry, back off, or move the job to a failed list. A test that runs in inline mode (which is every integration test, per `tests/support/env.ts`) proves the handler's logic and the request's behavior, but **cannot** prove the retry policy, the dead-letter list, or the worker's graceful shutdown. Those are covered by `jobs.queue.test.ts`, which runs against Redis database 15 with a real `Worker` — that's why both files exist. A developer reading only the inline tests would think "a failed email is logged and dropped", which is true in dev and false in production.
62. **The queue and the cache share one `noeviction` Redis instance:** The cache would prefer `allkeys-lru` (evict old entries when memory is full); the queue needs `noeviction` (never silently delete a job). One instance means one policy, and `noeviction` is the safer choice today because a lost cache entry is a slow read while a lost job is a lost email. The cost is that the cache cannot grow past `maxmemory` without failing writes — the cache's `set` is in a `try/catch` and logs `cache.error`, so a full Redis degrades the cache to `bypass` rather than crashing. A real production deployment would run separate instances for the two workloads.
63. **`smtpUrl` and `redisUrl` are in `SENSITIVE_KEYS`, but only at the three configured depths:** `REDIS_URL` and `SMTP_URL` can carry passwords (`redis://:pass@host`, `smtp://user:pass@host`), and Day 38 added both keys to `SENSITIVE_KEYS` so they're redacted when logged as `{ redisUrl }` or `{ config: { smtpUrl } }`. What is **not** covered: a URL inside a larger string (`"connecting to redis://user:pass@host"`), or a config dump nested deeper than two levels. Same limit as every other redaction rule — it's the safety net, not the defense; the defense is not putting the URL in the log call in the first place.

## Week 1 summary
Three things I can do now that I couldn't on Day 1:
- import and export files
- write TypeScript
- use Git PRs

One thing I want to get better at in Week 2:
- HTTP requests

## Week 2 summary
Three things I can do now that I couldn't on Day 8:
- Build a full REST API with Express and middleware.
- Validate every layer of a request with Zod.
- Design a repository pattern that decouples storage from logic.

Things that confused me:
- CORS preflight requests (why the browser blocks things `curl` doesn't).
- The exact order of middleware in `app.ts`.

What I'd do differently:
- Commit smaller and more often (I lost some work in a merge conflict).
- Write the smoke test earlier so I could catch regressions faster.

One thing I want to get better at in Week 3:
- Writing raw SQL and understanding database constraints.

## Week 3 summary
Three things I can do now that I couldn't on Day 15:
- Design database schemas with relations and constraints.
- Write and safely apply migrations to a database with existing data.
- Use transactions to keep multi-step operations atomic.

Things that confused me:
- The difference between `migrate dev` and `migrate deploy`.
- Why a rename requires `RENAME COLUMN` instead of `DROP` + `ADD`.

What I'd do differently:
- Write the migration check script earlier so I catch schema drift sooner.

One thing I want to get better at in Week 4:
- Implementing authentication and authorization securely.

## Week 4 summary
Three things I can do now that I couldn't on Day 22:
- Implement secure authentication (Argon2, JWT, refresh tokens with rotation).
- Design and enforce role-based access control with a matrix.
- Prove security properties with automated test scripts (tokens, access, rate limits).

Things that confused me:
- Why access tokens are stateless and refresh tokens are stateful.
- The last-owner race condition and how `SELECT ... FOR UPDATE` fixes it.

What I'd do differently:
- Write the access matrix test *before* writing the services, so the tests guide the design.

One thing I want to get better at in Week 5:
- Writing proper unit and integration tests with a framework (Vitest), instead of ad-hoc scripts.

## Week 5 summary
Three things I can do now that I couldn't on Day 28:
- Write fast unit tests for pure logic using Vitest.
- Mock external dependencies (like `randomBytes` or `Date`) to make tests deterministic.
- Use a fake implementation of an interface to test complex logic without a database.

Three more things I can do now that I couldn't on Day 29:
- Write integration tests against a real, isolated test database using Supertest.
- Migrate the test database from migration files, proving the migration history is reproducible from empty.
- Prove the test infrastructure itself works (name checks, truncation between tests, `RESTART IDENTITY`) before trusting it with real tests.

Three more things I can do now that I couldn't on Day 30:
- Write integration tests for task CRUD, visibility, filtering, sorting and pagination — the heart of TaskFlow.
- Write integration tests for project management, including **transactional duplicate and merge**, with the concurrency race under `Promise.all`.
- Practice **red-green-refactor** end-to-end on a real new rule (past due dates rejected on creation), with the boundary ("is today past?") extracted into a pure function tested deterministically.

Three more things I can do now that I couldn't on Day 31:
- Port a security-critical **access matrix** (24 actions × 3 personas = 72 cells) into a real test suite, with a **fingerprint** assertion that a denied request changes nothing.
- Test **sessions end-to-end**: refresh rotation, reuse detection, logout, logout-all, purge, expired-token behavior, parallel-refresh race, and the documented "access token survives logout" limitation.
- Run **combined coverage** (unit + integration) with a **ratcheted threshold** and prove the guard fails when it should.
- **Retire scripts safely**: only after re-introducing the exact bugs they caught and confirming the suite now catches them, then shrink `smoke.ts` to a post-build check of the compiled server.

Three more things I can do now that I couldn't on Day 32:
- Set up **Prettier + EditorConfig** and land the giant reformat as an isolated commit that `git blame` skips via `.git-blame-ignore-revs`.
- Install **ESLint flat config with type-aware rules** — including the side-by-side TypeScript 7 / TypeScript 6 alias workaround for `typescript-eslint`'s peer dependency — and triage a real `recommendedTypeChecked` findings pile down to zero.
- Enforce **architecture** with `no-restricted-imports`: controllers/routes/services/auth/middleware/schemas can't import Prisma; only `container.ts`, `server.ts`, and `cli.ts` can.
- Install **Husky + lint-staged** hooks that run in ~2s on staged files, plus a pre-push hook that runs typecheck + unit tests, and prove all five behaviors empirically (block, auto-fix, speed, `--no-verify` bypass, pre-push block).
- Wire **`precheck` and `ci`** as one command that matches what Week 7's pipeline will run, and add `.vscode/` settings for team consistency.

Three more things I can do now that I couldn't on Day 33:
- Replace `console.error` with **pino** producing one JSON object per line on stdout, with a **`mixin()`** that attaches `{ requestId, userId }` from the async context to every line automatically.
- Use **`AsyncLocalStorage`** so code deep inside a service logs with the right request ID without passing `requestId` through every function signature — and place the context middleware **after** `express.json()` because a listener runs in the context of whoever calls `emit`.
- **Redact secrets by field name** at 3 depths and write a **Prisma-aware error serializer** that keeps only the last line and drops `meta`, so query arguments never reach disk — then prove it with an **integration leak test** that pushes real passwords, hashes, tokens and an email through the whole API and fails if any appear in the output.
- **Lint the OpenAPI document with Redocly**: auto-generate `operationId` from method+path (unique by construction) and add descriptions to tags, so documentation mistakes fail `precheck` in ~2 seconds.
- Catch up the Day 32 **`docs.and.auth.test.ts`** file (it was never created) — every documented operation answers `401` without credentials, every protected operation documents a `401`, and `operationId` exists and is unique on every operation.

Three more things I can do now that I couldn't on Day 34:
- **Test rate limiters inside the suite** by building a fresh copy of the app with `RATE_LIMIT_ENABLED=true` and `vi.resetModules()`, and using `X-Forwarded-For` to give each test its own client address. This replaces the standalone `test:ratelimit` script.
- **Write characterization tests before a storage swap.** The rate limiter's current behavior is now pinned in the suite; Week 6's move to a Redis store can change the *storage* without changing the *behavior*, and the tests will say if anything changed.
- **Test documentation so it can't drift.** `project-docs.test.ts` parses the README, `.env.example`, and `CHANGELOG.md` and compares them against `envSchema.shape`, `package.json` scripts, and `package.json` version. Fix the docs, not the test.
- **Run Redis by hand in a throwaway container** and read the answers to `SET`, `GET`, `TTL`, `INCR`, `SET NX EX`, `HSET`, `HGETALL`, `SCAN`. `INCR` is atomic on a single-threaded server, so Day 9's race returns 2000, not 1998. `SET NX EX` is an atomic lock — the Redis version of `SELECT ... FOR UPDATE`.
- **Release with a fresh-clone test.** `v0.5.0` tagged only after the clone's `npm run ci` was green, which proves `.env.example` and the README are complete and the setup has no hidden dependency on my machine.

Things that confused me:
- The difference between a fake, a stub, and a spy.
- Why faking *all* timers broke the token tests.
- Why `fileParallelism: false` is required when files share one database.
- Why `nulls: "last"` matters only in the **descending** direction.
- Why a rate-limit test can fail on a *freshly started* server — turned out to be a double-mounted limiter (each request counted twice, effective limit halved) rather than any shared budget or ordering issue.
- Why `typescript-eslint` needs the side-by-side TypeScript 6/7 alias — the native TypeScript 7 compiler removed the JS API it depends on, and `npm i` doesn't tell you that; the `ERESOLVE` message does.
- Why 24 lint findings is normal and not a sign the code is bad — `recommendedTypeChecked` is the strictest config; reading the top-five rules turns a wall of errors into a handful of categories.
- Why the `"finish"` handler in `requestLogger` receives `requestId` explicitly and can't read the async context — the response is done, the socket is closing, and the context is either gone or belongs to a different request.
- Why `operationId` "unique by construction" (generated from method + path) is stronger than "unique by checking" (a test that has to be updated on every new endpoint).
- Why the rate-limiter tests need `vi.stubEnv` + `vi.resetModules` + a dynamic `import` — the shared test app has limits off, and there's no way to turn them on for one file without a fresh module graph.
- Why `TRUST_PROXY_HOPS` had to be `1` in the rate-limiter tests — each test poses as a different client with `X-Forwarded-For`, and the app must trust exactly one proxy hop to read that header. Zero hops would ignore it; two would trust a forged one.
- Why "the test failed with the wrong count" is a *good* diagnostic — exactly half the expected number means the limiter ran twice per request, which is a mount bug, not a config bug. The `RateLimit` response header (`remaining` dropping by 2) shows it in one probe.
- Why the docs test is not "testing the README" — it's testing the **contract** between three files that must agree (`envSchema`, `.env.example`, README). The files are the source of truth; the test just fails when they disagree.
- Why the Redis key was `rl:register:::/56`, not `rl:register:::1` — `ipKeyGenerator` normalizes IPv6 to a subnet, not a single address, so two clients in the same `/56` share one budget.
- Why `express-rate-limit` leaves the counter at `limit + 1` after a 429 — it increments *then* compares, and a blocked request still counts (unless `skipSuccessfulRequests: true`, which decrements on success only).
- Why the redis variant of the rate-limit suite needed its own assertions — a silent fallback to `MemoryStore` would pass every behavior test, so the "Redis specifics" block has to read `rl:*` directly.
- Why a private `prefix` field collides with the `Store` interface — the interface has an optional **public** `prefix`, and a class cannot narrow it to `private`. Rename to `keyPrefix`.
- Why `void this.run(...)` satisfies the lint but breaks `increment`'s type — `increment` returns `ClientRateLimitInfo | Promise<ClientRateLimitInfo>`, and `void` makes it `undefined`. `async increment(...) { return await this.run(...) }` satisfies both.
- Why the cache read has to come before `compute()` — the "read it after" version is design (c) from the experiment, and it stores the stale result under the live generation. Row 7 of the Day 37 mutation table is the test.
- Why the invalidation has to come after the commit — the "invalidate before commit" version lets a reader compute from the pre-commit snapshot and store it under the post-invalidation generation.
- Why `invalidate` must not throw — a Redis outage during a write must not turn into a 500 for the user. The TTL bounds the staleness; the write succeeds.
- Why `flushTestRedis()` in `beforeEach` is load-bearing, not housekeeping — `RESTART IDENTITY` makes project 1 a *different* project, but the cache key is the same, and the first test's answer is served as a hit to the second. Row 11 removes it and many tests fail in confusing ways.
- Why the `variant` has to be the **UTC date** and not `"today"` — the date is part of the key, and `"today"` never changes. At midnight UTC, overdue and due-soon change without any row changing, so the key has to change.
- Why `X-Cache: bypass` is a 200, not a 503 — the app can serve from the database when Redis is down; returning 503 would turn a cache outage into a stats outage.
- Why the job payload carries only ids — the worker must read the *current* title, assignee and project at run time, and personal data should not sit in Redis.
- Why `attempts: 5` counts the first run — `attemptsMade` starts at 1 and reaches 5; 5 means "1 attempt + 4 retries".
- Why a permanent failure is `UnrecoverableError` — BullMQ's retry decision is "retry unless it throws `UnrecoverableError`"; there is no other signal.
- Why the worker's connection needs `maxRetriesPerRequest: null` and the producer's wants `enableOfflineQueue: false` — the worker blocks on `BRPOP`-style commands, the producer only issues `add()`.
- Why BullMQ's `ConnectionOptions` is narrower than ioredis's `RedisOptions` — the `retryStrategy` types differ, and `toBullConnection` narrows explicitly rather than casting.
- Why `jobs.close()` belongs in `server.ts`'s shutdown — the producer holds a `Queue` (an ioredis connection), and leaving it open keeps the event loop alive.
- Why the worker must not run in `JOBS_MODE=inline` in production — inline mode runs in the API process, doesn't retry, and doesn't survive a restart.
- Why "no email when the assignee is the actor" is a service rule — the worker only sees ids; the service sees the actor and can skip the "assigning to yourself" case.
- Why a test that says `jobs.enqueue` was called is not the same as a test that says the email was sent — the three layers (handler unit, queue + worker against Redis, inline end-to-end) cover three different things.
- Why Mailpit's SMTP test sends real mail while the rest use the memory mailer — the memory mailer is fast and deterministic, but only real SMTP proves the header-injection defense and the delivery path.
- Why `SmtpMailer` doesn't retry on its own — BullMQ retries; an internal retry would produce `attempts × internalRetries` and race the queue's policy.
- Why `MemoryMailer.failWith` exists — the failure-path tests need to inject a failure without monkey-patching nodemailer.

What I'd do differently:
- Write the test *before* the code. The `slugify` test found a bug instantly that would have shipped otherwise.
- Compute the expected sort order by hand from the dataset before running the test, not after it fails. The five minutes I spent on that saved an hour of "is the code wrong or is my reasoning wrong?"
- When a rate-limit test fails, read the `RateLimit` response header first (`remaining`, `limit`), not the status code. The halving pattern (5→2, 60→30, 30→15) was visible in one probe and would have saved a full day of chasing the wrong hypothesis.
- Trust the mutation table, not the coverage number. Coverage said "88%, looks fine" while `rateLimit.ts` was at 33% with **zero assertions about its behavior** — and the script covering it was silently broken by a double mount.
- Don't try the ambitious version of a fix under time pressure. The `errorShape()` guard for `errorHandler.ts` broke the parser mid-edit; the disable-with-reason was correct all along and took 30 seconds.
- Land the formatting commit and the ESLint fixes as separate commits, and re-run `npm run format` after any multi-file manual edit. `format:check` in `precheck` catches the drift, but only if you remember to run it before committing.
- When migrating every log call site, run `npm run typecheck:all` after each file — the compiler is your to-do list, and one error at a time is much easier than five at the end.
- When adding the OpenAPI linter, run `lint:openapi` after every spec change, not just at the end — the errors compound otherwise (33 missing `operationId`s become 33 plus 5 missing tag descriptions plus 1 license warning in one shot).
- Write the characterization tests **before** the storage swap, not after. Day 35's rate-limiter tests are the model: pin today's behavior, then change the storage. If Week 6 changes the limiter and a test fails, I know exactly which behavior changed.
- Run the docs tests on the same PR as the docs change, not in a follow-up. `project-docs.test.ts` found four drifts in one run — all of them in files I had edited that day, all of them things I would have shipped.
- Decide the failure policy in writing before writing the code. Day 36's Step 1 table is the model: fail open / fail closed / degrade per feature, with a one-line reason. The worst time to make that decision is inside the `catch` of the first `redis.get()`.
- Make the shared store visible in the test, not just in the assertion. The "Redis specifics" block reads `rl:register:<ip>` directly — without it, a silent fallback to `MemoryStore` would pass every behavior test.
- Run the same test suite against both implementations of an interface. `describe.each(["memory", "redis"])` is the cheapest way to catch a store-specific bug (the mutation row 2, where two limiters with the same name share a counter).
- Write the four "cached answer never reaches..." tests **before** the stats service. They are the specification of the endpoint's security property, and writing them first would have caught the ordering of `requireProjectRole` and `cache.getOrCompute` before the code existed.
- Build the invalidation table before the write helpers. The seven writes are the enumeration of every path that changes the numbers; a write that is missing from the table is a write that doesn't invalidate.
- Run `bench:stats` **before** the cache was written. The lesson says "measure first." I measured after — the cache is justified by the design properties (authorization, key correctness) rather than by the timing. That's not wrong, but the timing is the stronger argument, and it's only available if the number comes first.
- Resist the urge to simplify the key by dropping the date. The date is an input to the answer (overdue changes at midnight UTC), and a key that omits it is a cache that serves yesterday's "due soon" count today.
- Treat `flushTestRedis()` in `beforeEach` as load-bearing, not housekeeping. Row 11 removes it and many tests fail in confusing ways. The rule is: *the cache's IDs are the database's IDs, so anything that resets the database must reset the cache*.
- Write the six-row failure table (worker not running / Redis down at assignment / SMTP down 10 min / worker killed mid-send / task deleted before job runs / garbage payload) **before** the assignment code, not after. The table *is* the design, and getting "the request returns 200 even when Redis is down" into the spec first saves a rewrite.
- Add the four `package.json` scripts (`worker`, `worker:json`, `start:worker`, `jobs`) in the **same commit** as `src/worker.ts` and `scripts/jobs.ts`, so `project-docs.test.ts` never sees a README mention that resolves to nothing.
- Extract `toBullConnection` into its own file (`src/jobs/bullConnection.ts`) so `queue.ts` and `worker.ts` both import it without creating a dependency from `worker.ts` to `queue.ts`. It works today because there's no cycle, but the current arrangement is one refactor away from one.
- Set the development `MAIL_TRANSPORT` default to `smtp` (Mailpit is up via `npm run db:up`), not `log`. A developer who runs `npm run worker` without setting `MAIL_TRANSPORT` should see an email in Mailpit, not a `mail.logged` line.
- Make `jobs -- retry <id>` print the job's `data` before retrying, so the operator's decision ("should I retry this?") has the one piece of context that matters. `job <id> queued again` is not enough.
- Treat "no outbox" as a first-class limitation, not a footnote. The failure table's "Redis down at assignment" row is **lost, not recovered**, and the honest thing is to say so in the README's Known Limitations and in the Day 38 notes, not to bury it under `job.enqueue_failed`.
- Pin `maxmemory-policy noeviction` for Redis with an assertion, not just a comment in `docker-compose.yml`. A future edit to the compose file could silently switch the policy and the `jobs.queue.test.ts` suite would not catch it (it runs against a real Redis whose policy is the test machine's, not the compose file's).
- Make the `flushTestRedis()` call in the jobs queue test file's `beforeEach` the **first** thing, before any test runs, so a previous test's jobs (or the `rl:*` counters) never leak into the next.
- Write the header-injection test at **both** the `oneLine` level (template test) **and** the `SmtpMailer` level (Mailpit test) from the first commit, not as an afterthought. The template test proves the flattening, the SMTP test proves the SMTP server treats the flattened subject as one line.

## OWASP API Top 10 (Day 27 Review)

| Risk | In TaskFlow | Where | Gap? |
|---|---|---|---|
| API1 Broken Object Level Authorization | `requireProjectRole` / `requireTaskRole` in services | `src/auth/access.ts`, `src/services/*.ts` | No |
| API2 Broken Authentication | Argon2id + timing-safe login + JWT + refresh rotation | `src/auth/password.ts`, `src/auth/tokens.ts`, `src/services/auth.service.ts` | No |
| API3 Broken Object Property Level Authorization | `.strict()` Zod schemas, `passwordHash` not in `User` | `src/schemas/*.ts`, `src/types.ts` | No |
| API4 Unrestricted Resource Consumption | Rate limits, body limit, server timeouts | `src/middleware/limiters.ts`, `src/app.ts`, `src/server.ts` | No |
| API5 Broken Function Level Authorization | Role-based access on every mutation | `src/services/*.ts` | No |
| API6 Unrestricted Access to Sensitive Business Flows | `/auth/login` + `/register` + `/refresh` throttled | `src/routes/auth.routes.ts` | No |
| API7 Server-Side Request Forgery | Not applicable yet (server never fetches URLs) | — | — |
| API8 Security Misconfiguration | Helmet, CORS allow-list, `JWT_SECRET` guard, `RATE_LIMIT_ENABLED` guard | `src/app.ts`, `src/config.ts` | No |
| API9 Improper Inventory Management | `/docs` can be disabled via `DOCS_ENABLED=false` | `src/config.ts`, `src/app.ts` | Partial (docs are public by default) |
| API10 Unsafe Consumption of APIs | Not applicable yet (server never calls other APIs) | — | — |

## API Conventions (Day 13 Audit)
- **POST:** Returns `201` and a `Location` header.
- **Errors:** All errors use the `{ "error": { "message": "..." } }` shape.
- **Lists:** All list responses are wrapped in a `data` array. Projects do not have `meta` yet because we haven't added pagination to them.
- **Casing:** All JSON field names are `camelCase`.
- **Status Codes:** 400 (bad input), 401 (unauthenticated), 403 (forbidden), 404 (missing URL resource), 409 (state conflict), 413 (payload too large), 429 (rate limited), 503 (not ready).

## Migration Rules (Day 20)
- Never edit an applied migration (Prisma checks the checksum).
- Rename columns with `RENAME COLUMN`, not `DROP` + `ADD`.
- Adding a required column: expand (nullable) → backfill → contract (`NOT NULL`).
- `migrate dev` on your laptop; `migrate deploy` in CI and production.
- Seeds are idempotent (`upsert`) and never run in production.
- `npm run db:check-migrations` verifies migrations from scratch.

## Business Rules (Day 31)
- A task's `dueDate` cannot be in the past **on creation** through the API.
- Updates may set a past date (people correct dates).
- The CLI (`SYSTEM` actor) is exempt — for imports and data fixes.
- "Today" is the UTC calendar date. Documented tradeoff (see Day 31 Observations).

## Logging Rules (Day 34)
- **One JSON object per line on stdout.** The platform collects; the app doesn't rotate or ship.
- **Stable `event` names** (`http.request`, `auth.refresh_reuse`, `redis.ready`, `redis.error`, `redis.unavailable`, `rate_limit.store_fallback`, `cache.error`, `queue.error`, `worker.error`, `worker.started`, `job.completed`, `job.will_retry`, `job.failed_permanently`, `job.inline_failed`, `job.enqueue_failed`, `mail.logged`) so alerts can match them for years.
- **Levels mean something.** `error` = someone should look. `warn` = suspicious but handled. `info` = normal business.
- **Every line inside a request carries `requestId`.** It matches the `X-Request-Id` response header; a user's bug report is one grep away from the full trace.
- **Redaction is a last safety net, not the defense.** Defense #1 is not putting the secret in the log call. Query strings, request bodies and emails are never logged; the request logger records the path only.
- **Prisma errors are trimmed** to their final line, `meta` dropped. Query arguments don't reach disk.
- **The leak test** in `tests/integration/logging.test.ts` pushes real passwords, hashes, tokens and an email through the whole API and fails if any appear in the output. It's the most important test in the logging change.

## Redis First Contact (Day 35)
- **Redis is an in-memory key-value store.** Fast, optional-by-design: data can expire, an unconfigured Redis can lose recent writes on a crash. Never the only copy of something you can't recreate.
- **`SET key value EX 10`** sets a TTL; `TTL key` shows the remaining seconds. A fixed window is one `INCR` plus one `EXPIRE ... NX`; the second `INCR` does not reset the clock, which is what makes the window fixed from the first request.
- **`SET key value NX EX 30`** is an atomic lock: one caller gets `OK`, the rest get `nil`. This is the Redis version of `SELECT ... FOR UPDATE` for a job claim.
- **`INCR` is atomic on the single-threaded server.** Day 9's file race (lost updates) becomes 2000 on Redis with the same two simultaneous loops. The counter can't lose a step because there is one thread.
- **Never `KEYS *` in production.** It scans the whole keyspace and blocks the single thread. Use `SCAN` with a cursor.
- **Hashes hold a small object per key** (`HSET stats:project:1 todo 3 done 5`, `HGETALL`), which is the shape a per-project dashboard cache would take.
- **Redis is a network dependency with failure modes.** Week 6 decides fail-open vs fail-closed for the limiter, and read-through vs error for the cache. Both are written down and tested, not left to the first `redis.get()` throw.

## Day 36 Observations

### Step 1 — failure-policy experiment (before the code)

| Feature | If Redis is down | Choice | Why |
|---|---|---|---|
| Global request limiter | Degrade to per-instance `MemoryStore` | **degrade** | Limits still apply, just per instance. Fail closed would 503 every request during any Redis outage; fail open would remove it entirely. |
| Login, register, refresh limiters | Degrade | **degrade** | Failing closed on `/auth/login` locks every user out during a Redis outage — worse than a temporarily weaker limit. Failing open gives an attacker unlimited guesses. Per-instance counting is the compromise. |
| Invitation limiter | Degrade | **degrade** | Same reasoning, lower stakes: 20/hour per instance instead of 20/hour total. |
| `/ready` endpoint | `200` with `degraded` | **degraded** | The app can serve; the operator sees it in the readiness output; the load balancer should keep routing. A 503 here would take the whole API down for a Redis outage. |
| Server startup | Start anyway, retry in background | **degrade** | A Redis hiccup during a deploy must not prevent the API from booting. `connectRedis()` returns `false`, logs `redis.unavailable`, and the retry loop kicks in. |

**Worst an attacker can do during a Redis outage under "degrade for login":** with N instances running, up to N × 10 login failures per 15 min per account (the per-instance fallback limit), instead of 10 total. A single-instance deployment has no worse behavior than before; a multi-instance deployment has the weakness until Redis recovers. Deliberate trade-off: without Redis, either every login is blocked (fail closed) or no login is limited (fail open). Per-instance counting is the middle ground.

### Step 17 — two-instance experiment (shared budget)

Setup: two servers, `RATE_LIMIT_ENABLED=true PORT=3000/3001`, `REDIS_URL` set (so both use Redis). Loop hits `POST /auth/register` with an empty body (`-d '{}'`), alternating ports:

```
port 3000 -> 400
port 3001 -> 400
port 3000 -> 400
port 3001 -> 400
port 3000 -> 400
port 3001 -> 429
```

Five `400` then one `429` on the **sixth** request, split across two processes. Before Day 36 (each process with its own `MemoryStore`) the same six requests would all have been `400`, because each instance would have counted only three.

**Redis inspection right after the loop:**
- `redis-cli --scan --pattern 'rl:*'` → `rl:register:::/56`, `rl:global:::/56` — two keys, one per limiter, **one shared counter each**.
- `get 'rl:register:::/56'` → `6`. The register limit is 5; `express-rate-limit` increments *then* compares, so a blocked request leaves the counter at `limit + 1`. The test asserts the status sequence (`[400, 400, 400, 400, 400, 429]`), not the counter value.
- `pttl 'rl:register:::/56'` → `3368289` ms (≈ 56 minutes left of the 1-hour window).
- `get 'rl:global:::/56'` → `(nil)` and `pttl` → `-2` **when inspected later** — the global window is 60 s, and the inspection happened more than a minute after the loop.
- The key contains `::` (the IPv6 loopback, normalized by `ipKeyGenerator` to the `/56` subnet) and `/56` (the prefix length), so it is `rl:register:::/56`, **not** `rl:register:::1`.

### Step 17 — survives a restart / rebuild from empty state

1. Deleted every `rl:*` key.
2. Re-ran the same 3×2 loop → **same sequence** `[400, 400, 400, 400, 400, 429]`.
3. With the counter over the limit:
   - Request against the running server → `429`.
   - Restarted port 3000.
   - Same request against the **fresh** process → **`429`**, not `400`. The counter lives in Redis, not in the process.

### Step 17 — per-instance when `REDIS_URL` is empty

Both servers restarted with `REDIS_URL=` (empty). Same 3×2 loop → **six `400`, zero `429`**. `redis-cli --scan --pattern 'rl:*'` → **no keys**. Each process sees 3 requests against its own limit of 5. `GET /ready` → `{ "status": "ok", "checks": { "database": "up", "redis": "disabled" } }`.

### Step 18 — the store as Redis sees it

`redis-cli monitor` while one register request is served shows a single `MULTI` transaction:

```
"multi"
"incr"     "rl:register:::/56"
"pexpire"  "rl:register:::/56"  "3600000"  "NX"
"pttl"     "rl:register:::/56"
"exec"
```

The `NX` is visible in the `pexpire` arguments.

### Step 19 — outage drill

- `docker stop taskflow-redis` → `/ready` flipped to `degraded` within ~1 s.
- Six register requests → `400 400 400 400 400 429` — the in-memory fallback still applies the limit, per instance.
- `docker start taskflow-redis` → within ~8 s, `/ready` returned `ok` **without restarting the server**.
- Server log during the outage: **one** `rate_limit.store_fallback` warning and **one** `redis.error` — not hundreds.
- Server log after recovery: **one** `redis.ready`.

### Step F — mutation table (7 rows)

| # | Break | Failed test | Result |
|---|---|---|---|
| 1 | Drop `"NX"` from `PEXPIRE` | store test "does not extend the window" | ✅ caught |
| 2 | Give the `refresh` limiter the name `register` | **only the redis variant** of the rate-limit tests | ✅ caught — the memory variant cannot see the collision |
| 3 | Return the raw email from `emailKey` | "never puts an email address into a Redis key" | ✅ caught |
| 4 | Rethrow in `ResilientStore.run` instead of falling back | outage test | ✅ caught |
| 5 | Remove `enableOfflineQueue: false` | outage tests still pass, but are **noticeably slower** | ⚠️ caught only as a **speed regression** |
| 6 | Delete the "REDIS_URL required in production" guard | config unit test | ✅ caught |
| 7 | Make `/ready` return 200 when `unavailable` | health integration test | ✅ caught |

### Step 20 — checkpoint answers

(Summarized here; full text on Day 36.)

1. `INCR` is one step; Day 9's read-modify-write had a gap.
2. `PEXPIRE ... NX` sets the expiry only if none exists; without it, every request resets the timer.
3. `enableOfflineQueue: false` fails fast instead of queueing; row 5 is a **latency** difference, not a correctness one.
4. **Degrade** for the login limiter: N × the budget, not unlimited (fail open) or zero (fail closed).
5. The email is hashed inside the Redis key so `MONITOR`/`KEYS` can't enumerate login targets.
6. Two limiters with the same name share a counter; only the redis variant can see the collision.
7. `/health` is liveness, `/ready` is readiness with a deadline; Redis down is `degraded` (200), database down is `unavailable` (503).
8. `"127.0.0.1:6379:6379"` binds to localhost; `"6379:6379"` publishes on every interface. `noeviction` is for the Day 38 queue (jobs must not be evicted); every key needs a TTL.

## Day 37 Observations

### Step 1 — thinking before coding

**1. What could make a cached stats answer wrong, and which mechanism handles each?**

| Situation | Mechanism |
|---|---|
| A task is created in the project | **Invalidation** (`invalidateStats(created.projectId)` in `addTask`) |
| A task's status changes | **Invalidation** (`invalidateStats(task.projectId, updated.projectId)` in `updateTask`) |
| A task's priority changes | **Invalidation** (same call) |
| A task moves to another project | **Invalidation** of **both** projects (the `Set` in `invalidateStats` dedupes) |
| A task is deleted | **Invalidation** (`invalidateStats(task.projectId)` in `deleteTask`) |
| Midnight UTC passes | **The date in the key** (`variant: todayUtc(now())`) |
| A script writes rows directly | **The TTL** (up to 60 s ± 10% of staleness) |
| Redis is down during a write | **The TTL** (`invalidate` never throws, so the write succeeds) |
| Redis is down during a read | **`bypass`** (computed fresh; `X-Cache: bypass`) |
| Two tests reuse project 1 | **`flushTestRedis()` in `beforeEach`** |
| The stats `computedAt` makes two answers look different | **Nothing** — a `hit` returns the same `computedAt`; it's the same stored JSON |
| `overdue` computed from a local midnight | **The UTC date** is what's in the key — the Day 31 trade-off |

**2. The race. Events in this order:** (1) reader misses; (2) reader reads the database; (3) writer commits; (4) writer invalidates; (5) reader stores its result.

| Design | Next request stale? |
|---|---|
| (a) one fixed key, writer deletes it | **Yes** — the reader stores its stale result under the same fixed key |
| (b) version read **before** computing, writer increments it | **No** — the reader stores under the old generation `g`; the writer's `INCR` moves the live generation to `g+1`; the next reader misses on `g+1` and computes fresh |
| (c) version read **after** computing | **Yes** — the reader reads `g+1`, stores its stale result under `g+1`, and the next reader sees it |

**Which one is wrong, and why?** (a) and (c) are both wrong: the read that determines *where to store* runs too late, so it sees the post-invalidation world and stores the old result in it. (b) is right because the store's destination is fixed at the *start*.

**3. The leak.** If the access check ran *after* a cache hit: a stranger would get the numbers from the cache on a hit, and the check would run too late. `getProjectStats` calls `access.requireProjectRole` **first**; a stranger gets `404` and never reaches the cache.

### Step 16 — benchmark (`bench:stats`)

**Setup:** `npm run db:bench-seed`, `npm run dev`, `npm run bench:stats` (15 iterations, each: invalidate → cold `miss` → warm `hit`).

**Numbers:** `project 179: cold (computed) 33.7 ms, warm (cached) 17.4 ms` — the cache saves **~16.3 ms** per request (~2× speedup). The cold time is dominated by the `groupBy(status, priority)` over the project's tasks. The `EXPLAIN ANALYZE` plan for the `groupBy` is still a `TODO`.

### Step 17 — mutation table (11 rows)

| # | Break | Failed test | Result |
|---|---|---|---|
| 1 | Delete `access.requireProjectRole` in `getProjectStats` | unit "checks access BEFORE the cache…" + integration "answers 404 to a stranger even while the entry is warm" | ✅ caught |
| 2 | `scope: "project"` (no id) | integration "keeps different projects apart", "does not let a member of one project read another project's entry" | ✅ caught |
| 3 | `variant: "today"` instead of the date | unit "builds the cache key from the project and the date", "uses a different key after midnight UTC" | ✅ caught |
| 4 | Remove invalidation from `deleteTask` | integration "after deleting a task" | ✅ caught |
| 5 | In `updateTask`, invalidate only `updated.projectId` | integration "moving a task out of the project", "refreshes BOTH projects…" | ✅ caught |
| 6 | Remove `stats.invalidateProject(targetId)` after a merge | integration "refreshes the target when two projects are merged" | ✅ caught |
| 7 | Read the generation **after** `compute()` | unit "stores a stale result under a dead generation…" | ✅ caught |
| 8 | Delete the single-flight lookup | unit "runs one computation for many simultaneous misses", integration "shares one computation…" | ✅ caught |
| 9 | Remove the `try/catch` around the read | unit "answers from the computation…", integration "still answers, straight from the database…" | ✅ caught |
| 10 | Replace `withJitter(...)` with the plain TTL | unit "spreads expiry times with jitter…" | ✅ caught |
| 11 | Delete `flushTestRedis()` from `setup.ts` | many tests, in confusing ways | ⚠️ caught **indirectly** |

**Row 7 is the lesson:** the "simpler" version of `getOrCompute` (read the version *after* `compute()`) passes every test except the race test. The rule is: **read the version first, compute second, store under the version you read**. The test that pins it is `"stores a stale result under a dead generation when a write happens during the computation"`.

**Row 11 is the other lesson:** `RESTART IDENTITY` makes project 1 a *different* project after truncation, but the cache key is still `cache:v1:project-stats:project:1:...`. Without `flushTestRedis()`, a cached `miss` from one test becomes a `hit` for a different project 1 in the next.

## Day 37 Checkpoint Answers

1. **What makes a good key?** Every input the answer depends on, and only those. Without the date, yesterday's "due soon" count is wrong today. With the user unnecessarily included, every member has their own cold start for an answer that is the same for all of them.
2. **Why does the access check run before the cache?** The cache stores *answers*, not *permissions*. If the check ran after a cache read, a stranger would get the numbers from the cache on a hit, and the check would run too late to matter.
3. **The stale-write race.** (1) reader misses; (2) reader reads the database; (3) writer commits; (4) writer invalidates (bumps `g` to `g+1`); (5) reader stores. With a fixed key (design a), step 5 writes the stale result under the live key. With the version read **before** computing (design b), the reader stored under `g`, the writer's `INCR` moves the live generation to `g+1`, and the next reader misses on `g+1`. With the version read **after** computing (design c), the reader reads `g+1` and stores its stale result under `g+1` — the same bug as (a), one step later.
4. **Why must invalidation happen after the commit?** If it runs *before*, a reader can start after the invalidation (reading `g+1`) but compute from the pre-commit snapshot, and store its stale result under `g+1`.
5. **What do the TTL, the generation counter and the date protect against?** The TTL bounds staleness when an invalidation is missed. The generation counter is the mechanism — every write bumps it, old entries become unreachable. The date in the key handles midnight UTC (overdue and due-soon change without any row changing).
6. **What do single-flight and jitter prevent?** Single-flight prevents a stampede *within one process*; jitter prevents a stampede across many entries (they don't all expire together). Single-flight doesn't protect across instances because each has its own `inFlight` map.
7. **Why is a write allowed to succeed even when invalidation fails?** The user's action should not fail because a cache is down. `invalidate` catches, logs (`cache.error`, throttled), and returns `void`. The damage is bounded by the TTL.
8. **Why did row 11 break tests in confusing ways?** `RESTART IDENTITY` makes project 1 a *different* project, but the cache key is the same. The same happens in production after `db:fresh`, a backup restore, or a re-creation from migrations. The fix is to flush the cache with the database.

## Day 38 Checkpoint Answers

1. **Why does a payload carry ids instead of the task title, and what does the worker read at run time?**
   > A payload that carries the title would send what the title *was* when the job was enqueued, not what it *is* when the handler runs. Between those two moments the task can be renamed, reassigned, or deleted, and the email should reflect the current state (or not be sent at all). The payload is `{ taskId, assigneeId, assignedById }` — ids only — and the worker reads the **task**, the **assignee**, the **assigner**, and the **project** from the database at run time. It also keeps personal data (titles, names, email addresses) out of Redis, which is consistent with Day 36's "hash the email before it becomes a key" rule.

2. **What does at-least-once delivery mean, and how does the handler stay safe when a job runs twice?**
   > "At-least-once" means the queue guarantees every job runs **at least** once — never lost — but it can run **more than once** if a worker crashes after doing the work and before acknowledging the job to Redis. The handler is safe because it **decides from the current database state, not from what the payload claims**: `"task-assigned"` first loads the task; if the task no longer exists, or `task.assigneeId !== payload.assigneeId`, it returns `{ outcome: "skipped", reason }` and sends nothing.

3. **Which failures are retried, which aren't, and why does `attempts` include the first run?**
   > **Retried**: temporary failures (anything `isPermanent` doesn't recognize — a connection timeout, a DNS hiccup, an SMTP 4xx). BullMQ waits 5 s, then 10, then 20, then 40, for `attempts: 5` total. **Not retried**: `isPermanent(error)` returns true for an SMTP 5xx and an envelope error; those throw `UnrecoverableError` and go straight to the failed list. A malformed payload or unknown job name also throws `UnrecoverableError` before the handler runs. **`attempts: 5` counts the first run**: BullMQ's `attemptsMade` starts at 1 on the first failure and reaches 5 on the last.

4. **What is the dual-write problem, what did you do about it today, and what does the outbox pattern change?**
   > The dual-write problem: "save the assignment in PostgreSQL" and "put a job in Redis" are two writes to two systems, with no transaction across them. Today's choice is "after the commit, log `job.enqueue_failed`, and never fail the request" — the assignment is correct and visible; the email is lost, and the log line is the only evidence. The **outbox pattern** fixes it by making the "to notify" row part of the same PostgreSQL transaction as the assignment — either both save or neither does — and a relay reads the outbox and enqueues the jobs (then deletes the rows).

5. **Why must the worker finish its active job on `SIGTERM`, and what happens to a job whose worker is killed outright?**
   > A worker that exits on `SIGTERM` without finishing its active job leaves the job *active* in Redis but unowned. `worker.close()` stops taking new jobs, lets the current handler finish, acknowledges the job to Redis, then exits. A worker **killed outright** leaves its job *stalled*; BullMQ notices after the job's lock expires (default 30 s) and gives it to another worker — one more way to get a duplicate run.

6. **Why does assignment refuse a user from another project with the same message as a user who doesn't exist?**
   > To prevent **enumeration**: if the two cases had different messages, an owner could probe whether an account exists by trying to assign a task to it. Both throw the same `UserError("User <id> is not a member of this project.")`; the integration test strips the digits from both messages and asserts they're equal.

7. **Why are titles flattened onto one line before they reach a mail header, and why is the body plain text?**
   > A `Subject:` value that contains `\r\nBcc: evil@example.com` is interpreted by the SMTP server as a second header, and the message gets an extra recipient. `oneLine(text, max)` replaces every line break (including `\u2028`/`\u2029`) with a space and truncates to a max length. The body is `text:` (plain text, no `html:`), so a title containing `<script>alert(1)</script>` is shown literally.

8. **Why do the queue tests close the worker in `afterEach` and poll with `waitFor` instead of sleeping?**
   > `afterEach` closes the worker so a worker from one test doesn't pick up a job from the next test — the file runs its tests against the **same** Redis queue. `waitFor` polls a condition with a short interval (20 ms) and a timeout (5 s), and **fails with a clear message** if the condition doesn't hold in time. A fixed `sleep(100)` would either be too short (flake) or too long (slow), and a `sleep` that "passed" tells you nothing about *why*.

## Day 38 Observations

### Step 1 — the failure table, filled in

| Situation | What happens to the assignment | What happens to the email | How it's noticed or recovered |
|---|---|---|---|
| The worker isn't running when someone is assigned | **Succeeds** — PostgreSQL is written, the job sits in Redis's `waiting` list | **Delayed** — the job runs as soon as a worker starts | `npm run jobs -- stats` shows `waiting: N`. When the worker starts, `job.completed` logs, and the message appears in Mailpit. No loss. |
| Redis is down at the moment of assignment | **Succeeds** — the write is saved; `jobs.enqueue` throws and is caught | **Lost** — no record anywhere of the intent to notify | The API logs `job.enqueue_failed`. The email is never sent. This is the dual-write problem, and the outbox pattern (Challenge 1) is the fix. |
| SMTP is down for ten minutes | **Succeeds** — the job is in Redis | **Retried** with backoff (5 s, 10 s, 20 s, 40 s) until the mailer succeeds or 5 attempts are used | `job.will_retry` with `attempt: job.attemptsMade` each time; once Mailpit is back, `job.completed` fires. If the outage outlasts the attempts, `job.failed_permanently` logs and `jobs -- failed` shows the job. |
| The worker is killed while sending | **Succeeds** (the assignment was saved before the job ran) | **May be sent twice** — the job is *stalled*; after ~30 s BullMQ gives it to another worker | `job.completed` appears twice (two workers). At-least-once delivery — the handler is idempotent, so at worst the assignee gets two emails. |
| The task is deleted before the job runs | **Succeeds** (the deletion) | **Skipped** — the handler finds no task and returns `{ outcome: "skipped", reason: "task no longer exists" }` | `job.completed` with `result: { outcome: "skipped", reason: "task no longer exists" }`. No email, no error. |
| The job's payload is garbage | **Succeeds** (the enqueue would have failed the Zod schema in the producer) | **Not sent** — `safeParse` fails, `UnrecoverableError("invalid job payload")` is thrown, the job goes straight to the failed list | `job.failed_permanently` with `attempt: 1`; `jobs -- failed` shows `attemptsMade=1` and `failedReason="invalid job payload"` — but **not** the payload. |

**What the table makes explicit:** the assignment is **always** saved (the request never fails because a notification can't be queued or sent). Three rows are "delayed, retried, or skipped — and the state is consistent"; two are "duplicate, but harmless because the handler is idempotent"; one is "**lost**, and only the outbox pattern would recover it."

### Step 17 — the two-instance durability drill

**Setup:** `docker compose ps` shows `taskflow-db`, `taskflow-redis`, `taskflow-mailpit` healthy. `npm run dev`, `npm run worker`, `.env` at `JOBS_MODE=queue`, `MAIL_TRANSPORT=smtp`, `SMTP_URL=smtp://localhost:1025`.

**Baseline:** assign task 1 to Alex. The PATCH returns `200` with `assigneeId: 2`. The worker logs `job.completed`, `result: { outcome: "sent" }`. Mailpit has one message: `Sam assigned you: Design the schema`, to `alex@example.com`. `jobs -- stats` → `completed: 1`.

**Durability 1 (worker stopped):**

1. `Ctrl+C` in the worker → `"shutting down: finishing the active jobs first"`.
2. Assign task 2 to Alex. The PATCH returns `200`. No `job.completed` yet.
3. `jobs -- stats` → `waiting: 1`. The job is sitting in Redis.
4. `npm run worker` → the new worker picks up the job immediately, logs `job.completed`, Mailpit has a second message.
5. `jobs -- stats` → `completed: 2, waiting: 0`.

**Durability 2 (worker restart):**

1. Assign task 3 to Mina. It completes. Mailpit has a third message.
2. Restart the worker (`Ctrl+C`, `npm run worker`). The worker logs `"worker started, waiting for jobs"`.
3. `completed: 3` is unchanged; nothing is re-run on startup.

### Step 19 — the SMTP outage drill

**Outage 1 (SMTP down, recover before attempts run out):**

1. `docker stop taskflow-mailpit`.
2. Assign task 4 to Alex. The PATCH returns `200`.
3. The worker logs `job.will_retry` with `attempt: 1`. ~5 s later, `attempt: 2`. ~10 s later, `attempt: 3`. ~20 s later, `attempt: 4`.
4. **Before** attempt 5 fires, `docker start taskflow-mailpit`.
5. The next retry succeeds: `job.completed`, `result: { outcome: "sent" }`. Mailpit has a message for Alex.

**Outage 2 (SMTP down past all attempts, then recover by hand):**

1. `docker stop taskflow-mailpit`.
2. Assign task 5 to Mina. Watch `job.will_retry` with `attempt: 1, 2, 3, 4, 5`.
3. After the 5th attempt fails, `job.failed_permanently` with `attempt: 5`.
4. `jobs -- stats` → `completed: 4, failed: 1`.
5. `jobs -- failed` → shows job 5 with `attempts=5` and the SMTP error reason.
6. `docker start taskflow-mailpit`, then `jobs -- retry 5`. `job.completed`, Mailpit has a message for Mina.

### Step 20 — the Redis outage drill

1. `docker stop taskflow-redis`. The worker logs `redis.error` (throttled). `/ready` flips to `degraded`.
2. Assign task 6 to Alex. The PATCH returns **`200`** — the assignment is saved. The API logs `job.enqueue_failed`.
3. `jobs -- stats` **fails** — Redis is down.
4. `docker start taskflow-redis`. `/ready` returns `ok`; the worker logs `redis.ready`.
5. **The email for task 6 is never sent.** The job was never enqueued. This is the "lost, not recovered" row — the outbox pattern is the fix.

### Week 6 numbers (Day 38)

- `typecheck:all` → green
- `lint` → green (the `no-unsafe-call` on `mailer.close` fixed by making `close` optional and using `mailer.close?.()`)
- `test:unit` → 19 files, 304/304
- `test:integration` → all passing, including `tasks.assignment.test.ts`, `jobs.queue.test.ts`, `mail.smtp.test.ts`
- `ci` → green
- Part F drills: **durability** ✅, **SMTP outage** (retry and exhaust) ✅, **Redis outage** (assignment succeeds, email lost) ✅

### The row-2 lesson (BullMQ connection type)

**What it is:** BullMQ's `ConnectionOptions` has a narrower `retryStrategy` type than ioredis's `RedisOptions`. Passing the full `RedisOptions` fails the TypeScript overload with `Type 'RetryStrategy' is not assignable to type '((times: number) => void | number | null) | undefined'`.

**What it is not:** a runtime problem.

**The fix:** `toBullConnection(opts)` returns a `Pick<RedisOptions, "host" | "port" | "username" | "password" | "db" | "tls">`, and both `queue.ts` and `worker.ts` spread it. The narrower type matches BullMQ's overload; `enableOfflineQueue: false` (producer) and `maxRetriesPerRequest: null` (worker) are added on top.

**The lesson:** when a library accepts a narrower type than the one you're holding, **narrow it explicitly** rather than casting. A cast (`as RedisOptions`) would have silenced the error while lying to the compiler about the shape; the `toBullConnection` helper says out loud what BullMQ actually consumes.

## Known limitations
*(Each of these is fixed by a specific upcoming week, showing forward planning.)*

1. **Search Wildcards:** Searching for `%` or `_` returns all tasks because SQL `LIKE` interprets them as wildcards.
2. **No Retries on `P2034`:** No automatic retries for deadlocks yet.
3. **No CI:** No GitHub Actions pipeline yet; **Week 7**.
4. **Offset pagination is slow on deep pages** — **Week 5**.
5. **`ILIKE` search lacks a trigram index** — **Week 5**.
6. **CSV export loads all rows** — **Week 5**.
7. **`/health` doesn't check the database:** liveness only; **`/ready`** is the readiness probe.
8. **Rate limits are in-memory (fixed on Day 36):** Counters now live in Redis and are shared across instances.
9. **During a Redis outage, rate limits degrade to per-instance.** The `ResilientStore` falls back to `MemoryStore`; `/ready` reports `degraded`.
10. **Fixed-window rate limiting allows a burst at the window boundary.**
11. **Per-account throttle can be abused to lock a victim out.**
12. **No CAPTCHA or MFA.**
13. **No email verification** — **Week 6** adds it.
14. **Access tokens cannot be revoked.**
15. **Member invites reveal email existence.**
16. **No automated alerting.**
17. **Only two roles (owner, member).**
18. **Legacy tasks and projects with no owner are invisible.**
19. **Moving a task out of a project can orphan it from a creator who left.**
20. **`listComments` still loads every comment before filtering.**
21. **Integration tests wipe the test database on every `beforeEach`.**
22. **Due-date rule uses the UTC date, not the caller's local date.**
23. **Integration tests don't cover every branch of `PATCH /tasks/:id`.**
24. **Rate-limiter window expiry was untested** — fixed on **Day 36**.
25. **No load testing** — **Week 7**.
26. **No contract test between OpenAPI and real responses.**
27. **Five scripts retired.**
28. **`smoke.ts` is intentionally small (12 checks).**
29. **`verify.sh` restarts the compiled server between `smoke` and `test:ratelimit`.**
30. **`eslint-config-prettier` is the only rule-disabling plugin.**
31. **`no-restricted-imports` is the architecture fitness function.**
32. **`precheck` / `ci` catch drift.**
33. **Hooks are not the gate.**
34. **Redaction is by key name only.**
35. **Prisma's own query log bypasses pino.**
36. **No log shipping or alerting yet.**
37. **Logs from before the context middleware rely on explicit `requestId`.**
38. **`operationId` is auto-generated from method+path.**
39. **`operation-4xx-response` is off in `redocly.yaml`.**
40. **During a Redis outage, rate limits are per instance, not shared.**
41. **Fixed-window rate limiting allows a burst at the boundary.**
42. **No Redis authentication or TLS in development.**
43. **`/ready` is public and reveals dependency state.**
44. **No email verification or password reset** — **Week 6**.
45. **No CI or container hardening yet** — **Week 7**.
46. **No load testing.**
47. **No contract test between OpenAPI and real responses.**
48. **Redis is a single instance with `noeviction` and `appendonly yes`.**
49. **The in-memory fallback's counters are local to the process and reset on restart.**
50. **`ipKeyGenerator` normalizes IPv6 to a `/56` subnet.**
51. **Cached stats can be up to ~66 s stale after a write that bypasses the service layer.**
52. **Single-flight is per process, not per cluster.**
53. **The three aggregate queries are not one snapshot.**
54. **`prisma/seed.ts`, `scripts/seed-bench.ts`, and the `bench` fixture write directly to the database and do not invalidate the cache.**
55. **Benchmark numbers from `bench:stats` (Day 37):** **cold (computed) 33.7 ms, warm (cached) 17.4 ms** on project 179 (~2× speedup).
56. **A Redis outage at the moment of assignment loses the notification (no outbox yet):** The assignment is saved (the request returns 200) and the failure is logged as `job.enqueue_failed`, but there is no durable record of the intent to notify. **Day 38's "Redis down at assignment" row in the failure table** is the honest case: *lost, not recovered.* The fix is the **transactional outbox** (Challenge 1 of Day 38, not implemented today).
57. **At-least-once means a rare duplicate email is possible:** A worker that crashes after sending but before acknowledging leaves the job stalled; BullMQ re-delivers it to another worker, which sends again. The handler is idempotent (it re-reads the current task and skips if the assignee changed), so the worst case is one duplicate email. For something that must never be duplicated (charging a card), a stored idempotency key in a `sent_notifications` table is the fix (Challenge 2).
58. **No per-user notification preferences or throttling:** Assigning, unassigning, and reassigning the same task in a minute sends **two** emails. Day 38's Challenge 3 is a 30-second debounce.
59. **The worker needs its own process in production:** `npm run worker` is a separate Node process; a single-process deployment will enqueue jobs and never run them. **Week 7** adds the Dockerfile and the deployment manifest that run the API and the worker as separate containers.
60. **SMTP error messages can contain addresses and reach the logs:** A `SmtpMailer` failure carries nodemailer's error object, whose `message` may include the recipient address. Day 34's `SENSITIVE_KEYS` redaction is by **field name**, and `message` is not in the list. The fix is a `serializeError`-style trim for mail errors (keep the SMTP response code, drop the recipient), the same shape as the Prisma trim from Day 34.
61. **`JOBS_MODE=inline` hides retry behavior:** Inline mode runs the handler in the API process, catches its rejection, and logs `job.inline_failed` — it does **not** retry, back off, or move the job to a failed list. Every integration test runs in inline mode (per `tests/support/env.ts`), so the retry policy, the dead-letter list, and the worker's graceful shutdown are only proven by `jobs.queue.test.ts`.
62. **The queue and the cache share one `noeviction` Redis instance:** The cache would prefer `allkeys-lru`, the queue needs `noeviction`. One instance means one policy, and `noeviction` is the safer choice today because a lost cache entry is a slow read while a lost job is a lost email. A real production deployment would run separate instances.
63. **`smtpUrl` and `redisUrl` are in `SENSITIVE_KEYS`, but only at the three configured depths:** `REDIS_URL` and `SMTP_URL` can carry passwords; Day 38 added both keys to `SENSITIVE_KEYS` so they're redacted when logged as `{ redisUrl }` or `{ config: { smtpUrl } }`. Not covered: a URL inside a larger string, or a config dump nested deeper than two levels.

## Week 1 summary
Three things I can do now that I couldn't on Day 1:
- import and export files
- write TypeScript
- use Git PRs

One thing I want to get better at in Week 2:
- HTTP requests

## Week 2 summary
Three things I can do now that I couldn't on Day 8:
- Build a full REST API with Express and middleware.
- Validate every layer of a request with Zod.
- Design a repository pattern that decouples storage from logic.

Things that confused me:
- CORS preflight requests (why the browser blocks things `curl` doesn't).
- The exact order of middleware in `app.ts`.

What I'd do differently:
- Commit smaller and more often (I lost some work in a merge conflict).
- Write the smoke test earlier so I could catch regressions faster.

One thing I want to get better at in Week 3:
- Writing raw SQL and understanding database constraints.

## Week 3 summary
Three things I can do now that I couldn't on Day 15:
- Design database schemas with relations and constraints.
- Write and safely apply migrations to a database with existing data.
- Use transactions to keep multi-step operations atomic.

Things that confused me:
- The difference between `migrate dev` and `migrate deploy`.
- Why a rename requires `RENAME COLUMN` instead of `DROP` + `ADD`.

What I'd do differently:
- Write the migration check script earlier so I catch schema drift sooner.

One thing I want to get better at in Week 4:
- Implementing authentication and authorization securely.

## Week 4 summary
Three things I can do now that I couldn't on Day 22:
- Implement secure authentication (Argon2, JWT, refresh tokens with rotation).
- Design and enforce role-based access control with a matrix.
- Prove security properties with automated test scripts (tokens, access, rate limits).

Things that confused me:
- Why access tokens are stateless and refresh tokens are stateful.
- The last-owner race condition and how `SELECT ... FOR UPDATE` fixes it.

What I'd do differently:
- Write the access matrix test *before* writing the services, so the tests guide the design.

One thing I want to get better at in Week 5:
- Writing proper unit and integration tests with a framework (Vitest), instead of ad-hoc scripts.

## Week 5 summary
Three things I can do now that I couldn't on Day 28:
- Write fast unit tests for pure logic using Vitest.
- Mock external dependencies (like `randomBytes` or `Date`) to make tests deterministic.
- Use a fake implementation of an interface to test complex logic without a database.

Three more things I can do now that I couldn't on Day 29:
- Write integration tests against a real, isolated test database using Supertest.
- Migrate the test database from migration files, proving the migration history is reproducible from empty.
- Prove the test infrastructure itself works (name checks, truncation between tests, `RESTART IDENTITY`) before trusting it with real tests.

Three more things I can do now that I couldn't on Day 30:
- Write integration tests for task CRUD, visibility, filtering, sorting and pagination — the heart of TaskFlow.
- Write integration tests for project management, including **transactional duplicate and merge**, with the concurrency race under `Promise.all`.
- Practice **red-green-refactor** end-to-end on a real new rule (past due dates rejected on creation), with the boundary ("is today past?") extracted into a pure function tested deterministically.

Three more things I can do now that I couldn't on Day 31:
- Port a security-critical **access matrix** (24 actions × 3 personas = 72 cells) into a real test suite, with a **fingerprint** assertion that a denied request changes nothing.
- Test **sessions end-to-end**: refresh rotation, reuse detection, logout, logout-all, purge, expired-token behavior, parallel-refresh race, and the documented "access token survives logout" limitation.
- Run **combined coverage** (unit + integration) with a **ratcheted threshold** and prove the guard fails when it should.
- **Retire scripts safely**: only after re-introducing the exact bugs they caught and confirming the suite now catches them, then shrink `smoke.ts` to a post-build check of the compiled server.

Three more things I can do now that I couldn't on Day 32:
- Set up **Prettier + EditorConfig** and land the giant reformat as an isolated commit that `git blame` skips via `.git-blame-ignore-revs`.
- Install **ESLint flat config with type-aware rules** — including the side-by-side TypeScript 7 / TypeScript 6 alias workaround for `typescript-eslint`'s peer dependency — and triage a real `recommendedTypeChecked` findings pile down to zero.
- Enforce **architecture** with `no-restricted-imports`: controllers/routes/services/auth/middleware/schemas can't import Prisma; only `container.ts`, `server.ts`, and `cli.ts` can.
- Install **Husky + lint-staged** hooks that run in ~2s on staged files, plus a pre-push hook that runs typecheck + unit tests, and prove all five behaviors empirically (block, auto-fix, speed, `--no-verify` bypass, pre-push block).
- Wire **`precheck` and `ci`** as one command that matches what Week 7's pipeline will run, and add `.vscode/` settings for team consistency.

Three more things I can do now that I couldn't on Day 33:
- Replace `console.error` with **pino** producing one JSON object per line on stdout, with a **`mixin()`** that attaches `{ requestId, userId }` from the async context to every line automatically.
- Use **`AsyncLocalStorage`** so code deep inside a service logs with the right request ID without passing `requestId` through every function signature — and place the context middleware **after** `express.json()` because a listener runs in the context of whoever calls `emit`.
- **Redact secrets by field name** at 3 depths and write a **Prisma-aware error serializer** that keeps only the last line and drops `meta`, so query arguments never reach disk — then prove it with an **integration leak test** that pushes real passwords, hashes, tokens and an email through the whole API and fails if any appear in the output.
- **Lint the OpenAPI document with Redocly**: auto-generate `operationId` from method+path (unique by construction) and add descriptions to tags, so documentation mistakes fail `precheck` in ~2 seconds.
- Catch up the Day 32 **`docs.and.auth.test.ts`** file (it was never created) — every documented operation answers `401` without credentials, every protected operation documents a `401`, and `operationId` exists and is unique on every operation.

Three more things I can do now that I couldn't on Day 34:
- **Test rate limiters inside the suite** by building a fresh copy of the app with `RATE_LIMIT_ENABLED=true` and `vi.resetModules()`, and using `X-Forwarded-For` to give each test its own client address. This replaces the standalone `test:ratelimit` script.
- **Write characterization tests before a storage swap.** The rate limiter's current behavior is now pinned in the suite; Week 6's move to a Redis store can change the *storage* without changing the *behavior*, and the tests will say if anything changed.
- **Test documentation so it can't drift.** `project-docs.test.ts` parses the README, `.env.example`, and `CHANGELOG.md` and compares them against `envSchema.shape`, `package.json` scripts, and `package.json` version. Fix the docs, not the test.
- **Run Redis by hand in a throwaway container** and read the answers to `SET`, `GET`, `TTL`, `INCR`, `SET NX EX`, `HSET`, `HGETALL`, `SCAN`. `INCR` is atomic on a single-threaded server, so Day 9's race returns 2000, not 1998. `SET NX EX` is an atomic lock — the Redis version of `SELECT ... FOR UPDATE`.
- **Release with a fresh-clone test.** `v0.5.0` tagged only after the clone's `npm run ci` was green, which proves `.env.example` and the README are complete and the setup has no hidden dependency on my machine.

Things that confused me:
- The difference between a fake, a stub, and a spy.
- Why faking *all* timers broke the token tests.
- Why `fileParallelism: false` is required when files share one database.
- Why `nulls: "last"` matters only in the **descending** direction.
- Why a rate-limit test can fail on a *freshly started* server — turned out to be a double-mounted limiter (each request counted twice, effective limit halved) rather than any shared budget or ordering issue.
- Why `typescript-eslint` needs the side-by-side TypeScript 6/7 alias — the native TypeScript 7 compiler removed the JS API it depends on, and `npm i` doesn't tell you that; the `ERESOLVE` message does.
- Why 24 lint findings is normal and not a sign the code is bad — `recommendedTypeChecked` is the strictest config; reading the top-five rules turns a wall of errors into a handful of categories.
- Why the `"finish"` handler in `requestLogger` receives `requestId` explicitly and can't read the async context — the response is done, the socket is closing, and the context is either gone or belongs to a different request.
- Why `operationId` "unique by construction" (generated from method + path) is stronger than "unique by checking" (a test that has to be updated on every new endpoint).
- Why the rate-limiter tests need `vi.stubEnv` + `vi.resetModules` + a dynamic `import` — the shared test app has limits off, and there's no way to turn them on for one file without a fresh module graph.
- Why `TRUST_PROXY_HOPS` had to be `1` in the rate-limiter tests — each test poses as a different client with `X-Forwarded-For`, and the app must trust exactly one proxy hop to read that header. Zero hops would ignore it; two would trust a forged one.
- Why "the test failed with the wrong count" is a *good* diagnostic — exactly half the expected number means the limiter ran twice per request, which is a mount bug, not a config bug. The `RateLimit` response header (`remaining` dropping by 2) shows it in one probe.
- Why the docs test is not "testing the README" — it's testing the **contract** between three files that must agree (`envSchema`, `.env.example`, README). The files are the source of truth; the test just fails when they disagree.
- Why the Redis key was `rl:register:::/56`, not `rl:register:::1` — `ipKeyGenerator` normalizes IPv6 to a subnet, not a single address, so two clients in the same `/56` share one budget.
- Why `express-rate-limit` leaves the counter at `limit + 1` after a 429 — it increments *then* compares, and a blocked request still counts (unless `skipSuccessfulRequests: true`, which decrements on success only).
- Why the redis variant of the rate-limit suite needed its own assertions — a silent fallback to `MemoryStore` would pass every behavior test, so the "Redis specifics" block has to read `rl:*` directly.
- Why a private `prefix` field collides with the `Store` interface — the interface has an optional **public** `prefix`, and a class cannot narrow it to `private`. Rename to `keyPrefix`.
- Why `void this.run(...)` satisfies the lint but breaks `increment`'s type — `increment` returns `ClientRateLimitInfo | Promise<ClientRateLimitInfo>`, and `void` makes it `undefined`. `async increment(...) { return await this.run(...) }` satisfies both.
- Why the cache read has to come before `compute()` — the "read it after" version is design (c) from the experiment, and it stores the stale result under the live generation. Row 7 of the Day 37 mutation table is the test.
- Why the invalidation has to come after the commit — the "invalidate before commit" version lets a reader compute from the pre-commit snapshot and store it under the post-invalidation generation.
- Why `invalidate` must not throw — a Redis outage during a write must not turn into a 500 for the user. The TTL bounds the staleness; the write succeeds.
- Why `flushTestRedis()` in `beforeEach` is load-bearing, not housekeeping — `RESTART IDENTITY` makes project 1 a *different* project, but the cache key is the same, and the first test's answer is served as a hit to the second. Row 11 removes it and many tests fail in confusing ways.
- Why the `variant` has to be the **UTC date** and not `"today"` — the date is part of the key, and `"today"` never changes. At midnight UTC, overdue and due-soon change without any row changing, so the key has to change.
- Why `X-Cache: bypass` is a 200, not a 503 — the app can serve from the database when Redis is down; returning 503 would turn a cache outage into a stats outage.
- Why the job payload carries only ids — the worker must read the *current* title, assignee and project at run time, and personal data should not sit in Redis.
- Why `attempts: 5` counts the first run — `attemptsMade` starts at 1 and reaches 5; 5 means "1 attempt + 4 retries".
- Why a permanent failure is `UnrecoverableError` — BullMQ's retry decision is "retry unless it throws `UnrecoverableError`"; there is no other signal.
- Why the worker's connection needs `maxRetriesPerRequest: null` and the producer's wants `enableOfflineQueue: false` — the worker blocks on `BRPOP`-style commands, the producer only issues `add()`.
- Why BullMQ's `ConnectionOptions` is narrower than ioredis's `RedisOptions` — the `retryStrategy` types differ, and `toBullConnection` narrows explicitly rather than casting.
- Why `jobs.close()` belongs in `server.ts`'s shutdown — the producer holds a `Queue` (an ioredis connection), and leaving it open keeps the event loop alive.
- Why the worker must not run in `JOBS_MODE=inline` in production — inline mode runs in the API process, doesn't retry, and doesn't survive a restart.
- Why "no email when the assignee is the actor" is a service rule — the worker only sees ids; the service sees the actor and can skip the "assigning to yourself" case.
- Why a test that says `jobs.enqueue` was called is not the same as a test that says the email was sent — the three layers (handler unit, queue + worker against Redis, inline end-to-end) cover three different things.
- Why Mailpit's SMTP test sends real mail while the rest use the memory mailer — the memory mailer is fast and deterministic, but only real SMTP proves the header-injection defense and the delivery path.
- Why `SmtpMailer` doesn't retry on its own — BullMQ retries; an internal retry would produce `attempts × internalRetries` and race the queue's policy.
- Why `MemoryMailer.failWith` exists — the failure-path tests need to inject a failure without monkey-patching nodemailer.

What I'd do differently:
- Write the test *before* the code. The `slugify` test found a bug instantly that would have shipped otherwise.
- Compute the expected sort order by hand from the dataset before running the test, not after it fails.
- When a rate-limit test fails, read the `RateLimit` response header first (`remaining`, `limit`), not the status code.
- Trust the mutation table, not the coverage number.
- Don't try the ambitious version of a fix under time pressure. The `errorShape()` guard broke the parser mid-edit; the disable-with-reason was correct all along and took 30 seconds.
- Land the formatting commit and the ESLint fixes as separate commits.
- When migrating every log call site, run `npm run typecheck:all` after each file.
- When adding the OpenAPI linter, run `lint:openapi` after every spec change.
- Write the characterization tests **before** the storage swap.
- Run the docs tests on the same PR as the docs change.
- Decide the failure policy in writing before writing the code.
- Make the shared store visible in the test, not just in the assertion.
- Run the same test suite against both implementations of an interface.
- Write the four "cached answer never reaches..." tests **before** the stats service.
- Build the invalidation table before the write helpers.
- Run `bench:stats` **before** the cache was written.
- Resist the urge to simplify the key by dropping the date.
- Treat `flushTestRedis()` in `beforeEach` as load-bearing, not housekeeping.
- Write the six-row failure table **before** the assignment code.
- Add the four `package.json` scripts in the **same commit** as `src/worker.ts` and `scripts/jobs.ts`.
- Extract `toBullConnection` into its own file (`src/jobs/bullConnection.ts`).
- Set the development `MAIL_TRANSPORT` default to `smtp`.
- Make `jobs -- retry <id>` print the job's `data` before retrying.
- Treat "no outbox" as a first-class limitation.
- Pin `maxmemory-policy noeviction` for Redis with an assertion.
- Put `flushTestRedis()` in the jobs queue test file's `beforeEach` first.
- Write the header-injection test at **both** the `oneLine` level and the `SmtpMailer` level from the first commit.
