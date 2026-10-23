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
   > `check, then insert` has a gap between the two steps where another request can slip in (race condition). A foreign key is checked *inside* the write operation by the database, so there is no gap and no code path can bypass it.
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

## API Conventions (Day 13 Audit)
- **POST:** Returns `201` and a `Location` header.
- **Errors:** All errors use the `{ "error": { "message": "..." } }` shape.
- **Lists:** All list responses are wrapped in a `data` array. Projects do not have `meta` yet because we haven't added pagination to them.
- **Casing:** All JSON field names are `camelCase`.
- **Status Codes:** 400 (bad input), 404 (missing URL resource), 409 (state conflict).

## Known limitations
*(Each of these is fixed by a specific upcoming week, showing forward planning).*

1. **Search Wildcards:** Searching for `%` or `_` returns all tasks because SQL `LIKE` interprets them as wildcards. To fix, escape these characters in the service layer before querying.
2. **Unauthenticated Authors:** The `author` field for comments is currently a plain string supplied by the client. Anyone can pretend to be anyone. This will be fixed in **Week 4** when we add JWT authentication.
3. **No Automated Tests:** We currently rely on a manual `npm run smoke` test. Proper unit and integration tests will be added in **Week 5**.

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