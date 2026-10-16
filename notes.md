# Week 1 Notes — TaskFlow CLI

## What I learned

- **Node.js fundamentals:** the event loop, async/await, Promises, and how `process.argv` feeds CLI input.
- **Modules and structure:** splitting code into `types.ts`, `config.ts`, `storage.ts`, `commands.ts`, and `index.ts` — one job per file.
- **Environment and config:** reading `process.env`, loading `.env`, and validating config once at startup so failures happen fast and loud.
- **TypeScript:** type vs interface, literal and union types, narrowing, generics, utility types, discriminated unions, and the `never` check in switches.
- **Zod:** validating data from outside the program (JSON file contents, env values) at the boundary so internal code can trust its types.
- **Streams:** readable/writable/transform streams, and why `pipeline()` handles errors and cleanup better than `.pipe()`.
- **Git workflow:** branches, pull requests, squash merges, conventional commits, merge conflict resolution, and safe undo tools (`restore`, `stash`, `revert`, `reflog`).



# Checkpoint answers (Days 2–6)

### Day 2 — CLI commands and error handling
1. ...
2. ...

### Day 3 — Modules and npm scripts
1. ...

### Day 4 — Streams, paths, config
1. ...

### Day 5 — TypeScript essentials
1. ...

### Day 6 — Git workflow
1. Difference between `git revert` and `git reset --hard`? Which is safe on a shared branch?
   > `git reset --hard` moves the branch pointer backward, deleting commits — it rewrites history and breaks anyone who already pulled. `git revert` adds a new commit that cancels an old one, leaving history intact. **`git revert` is safe on shared branches.**

2. Why squash-merge PRs instead of keeping every small commit on `main`?
   > Feature branches accumulate messy WIP commits. Squash-merging combines them into one logical commit, so `main` reads as one clean commit per feature — easier to review, bisect, and revert.

3. What do the three conflict markers mean?
   > `<<<<<<< HEAD` starts your current branch's version; `=======` separates the two versions; `>>>>>>> branch-name` ends the incoming branch's version. You pick what to keep and delete all three lines.

4. Why write `Closes #1` in the PR description?
   > It's a GitHub closing keyword. When the PR merges, GitHub auto-closes the linked issue and adds a reference. Keeps issues and PRs in sync without manual bookkeeping.

## Week 1 summary

Three things I can do now that I couldn't on Day 1:
- import and exprot file 
- writing typescript

One thing I want to get better at in Week 2:
- http requests
## Known limitations on day 9

### Concurrency (file storage)
The JSON file store is not safe for concurrent writes.

**Experiment:** fired 8 parallel POST /tasks requests.
**Expected:** 8 new tasks. **Observed:** 5 lost, only 3 new tasks created.

**Cause:** each request does read → modify → write on `tasks.json`. When
requests overlap, multiple reads see the same stale state. The last write wins,
silently discarding the others' changes. This is a **lost update race condition**.

**Fixes:**
- Short-term (single process): queue writes in-process so only one read-modify-write
  runs at a time.
- Real fix: a database with transactions and unique ID sequences (Week 3).