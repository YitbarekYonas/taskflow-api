# Testing TaskFlow

## The layers

| Layer | Where | Needs | Speed | What it proves |
|---|---|---|---|---|
| Unit | `tests/unit` | nothing | ~2 s | one function or rule, in isolation |
| Integration | `tests/integration` | PostgreSQL | ~70 s | the real app, routes through SQL |
| Smoke | `npm run smoke` | a running server | seconds | the compiled build answers real HTTP |

## Commands

| Command | What it does |
|---|---|
| `npm test` | Unit tests, then integration tests |
| `npm run test:watch` | Re-run affected tests on save |
| `npm run test:coverage` | Unit + integration once, with coverage thresholds (90/78/96/92) |
| `npm run ci` | `precheck` + `test:coverage` — what CI runs |
| `npm run verify` | Build, start the compiled server, run unit + integration + smoke |

## Conventions

- Tests for access rules use three personas: owner, member, stranger (`tests/support/scenarios.ts`).
- Arrange with factories (direct inserts), act through the API, assert on the response **and** the database.
- A refused request must change nothing: the access matrix compares a fingerprint of every table.
- Every test starts from empty tables; the helpers refuse to touch a database whose name does not end in `_test`.
- Write the failing test first when fixing a bug. After writing tests, break the code on purpose to check they notice.
- Rate limiters are tested with `X-Forwarded-For` per test, and the app copy with limits on is built via `vi.stubEnv` + `vi.resetModules()` + dynamic import.

## Known gaps

- Rate limiter window expiry (the counter resetting after 15 minutes) is not tested — needs a faked clock inside the limiter's store.
- No load or performance tests.
- No browser tests.
- No contract test between the OpenAPI document and real responses.
- Coverage excludes `src/cli.ts`, `src/server.ts`, `src/utils.ts`, and `src/generated/**`.
