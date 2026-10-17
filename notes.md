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

## Known limitations

### Concurrency (file storage)
*Fixed in Week 2, Day 11.*
The JSON file store is no longer safe for concurrent writes across *multiple processes*, but it is safe for concurrent HTTP requests within the *same process*. We fixed the lost-update bug by implementing a write queue in `JsonFileRepository` (chaining promises so only one read-modify-write cycle happens at a time).

**Experiment:** fired 8 parallel POST /tasks requests.
**Result after fix:** all 8 tasks were created successfully.

**Remaining limitation:** a second server instance or running the CLI at the same time would still cause a race. Only a real database fixes that.

## Week 1 summary
Three things I can do now that I couldn't on Day 1:
- import and export files
- write TypeScript
- use Git PRs

One thing I want to get better at in Week 2:
- HTTP requests