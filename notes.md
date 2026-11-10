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
- **Status Codes:** 400 (bad input), 401 (unauthenticated), 403 (forbidden), 404 (missing URL resource), 409 (state conflict), 413 (payload too large), 429 (rate limited).

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

## Known limitations
*(Each of these is fixed by a specific upcoming week, showing forward planning).*

1. **Search Wildcards:** Searching for `%` or `_` returns all tasks because SQL `LIKE` interprets them as wildcards. To fix, escape these characters in the service layer before querying.
2. **No Retries on `P2034`:** We haven't implemented automatic retries for deadlocks yet. If two merges clash, the user must retry manually.
3. **No CI:** We don't have a GitHub Actions pipeline yet. This will be added in **Week 7**.
4. **Offset pagination is slow on deep pages:** `OFFSET 49980` still walks past 49,980 rows. This will be fixed in **Week 5** with keyset pagination.
5. **`ILIKE` search lacks a trigram index:** The search is slow on large tables because it does a full scan. This will be fixed in **Week 5**.
6. **CSV export loads all rows:** The export uses `findAll()`, which loads the entire table into memory. This will be fixed in **Week 5** with a streaming query.
7. **`/health` doesn't check the database:** It returns `ok` even if Postgres is down. This will be fixed in **Week 7** with a proper readiness check.
8. **Rate limits are in-memory:** They reset on restart and don't share between instances. Week 6 moves them to Redis.
9. **Per-account throttle can be abused to lock a victim out:** An attacker can flood `/auth/login` with wrong passwords until the account is throttled. Rate limiting makes it slow, but not impossible.
10. **No CAPTCHA or MFA:** A determined attacker with a botnet can still try many passwords.
11. **No email verification:** Accounts can be created with fake emails.
12. **Access tokens cannot be revoked:** A stolen access token stays valid for up to 15 minutes after logout.
13. **Member invites reveal email existence:** Adding a member by email returns `404` if the user doesn't exist. Rate limiting makes probing slow, but not impossible.
14. **No automated alerting:** Repeated `auth 401` events are logged but not flagged.
15. **Only two roles (owner, member):** No read-only "viewer" role yet.
16. **Legacy tasks and projects with no owner are invisible:** Only the CLI can see/modify them.
17. **Moving a task out of a project can orphan it from a creator who left.**
18. **`listComments` still loads every comment before filtering:** It uses `findAll()` instead of a `WHERE taskId = ?` query.
19. **Integration tests wipe the test database on every `beforeEach`:** This is correct for the current suite (simple, obviously correct, a few ms per wipe), but it means test files must run serially (`fileParallelism: false`). Per-worker databases (Day 30 challenge) would allow parallelism at the cost of setup complexity.
20. **Due-date rule uses the UTC date, not the caller's local date:** A user in UTC−8 can be rejected at 22:00 local for setting "today" in their time zone. Options considered and the decision are recorded in the Day 31 Observations section (accepted UTC, rationale: consistency with the rest of the API, client-side UX is a better place to soften it).
21. **Integration tests don't cover every branch of `PATCH /tasks/:id`:** Gaps I found in my own test list: preserving `createdById` through a patch is only implicitly covered, and "stranger moves `projectId`" isn't a distinct test. Not bugs — coverage gaps to fill on a second pass.
22. **`test:ratelimit` has 3 raw branches where the effective limit is what the coverage step calls a "true gap":** The limiter's full behavior (counters, key generators, 429 body) is only exercised by the standalone script, not the suite. This is why `test:ratelimit` stays until Challenge 1 ports it (with `beforeEach` reset).
23. **`test:ratelimit` was mounted twice at one point** (in `app.ts` by path and in `auth.routes.ts` by route), which halved every IP-keyed limit. The double mount was caught by `scripts/limiter-probe.ts` and fixed by removing the `app.use("/auth/...", ...)` lines from `app.ts`. Any future limiter added to `app.ts` by path must not also be added to a route — `grep -rn "Limiter" src/` is the fast check.
24. **Five scripts retired:** `token-attacks`, `auth-coverage`, `refresh-flow`, `access-attacks`, `security-checks` (and their `package.json` commands). Their replacements are the integration suites listed above; the mutation table rows 1–4, 6, 8–10 are the evidence that each bug the scripts caught is now caught by the suite.
25. **`smoke.ts` is intentionally small (12 checks):** It's a post-build check of the *compiled* `dist/` server, not a behavior suite. Detailed behavior is `npm test`'s job; if a check needs adding, it goes in an integration test, not in `smoke.ts`.
26. **`verify.sh` restarts the compiled server between `smoke` and `test:ratelimit`:** In-memory rate-limit counters must start at zero for `test:ratelimit`, and `test:integration` + `smoke` will have drained them on the shared server. The restart is what makes `verify.sh` green end-to-end. If `test:ratelimit` ever fails after a clean restart, the bug is in the limiter or the script's setup — not in the ordering.

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

## Week 5 summary (Partial)
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
