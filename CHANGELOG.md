# Changelog

## 0.5.0 - Testing, code quality and observability
### Breaking changes
- Log output is now JSON, one object per line (it was free text). `LOG_LEVEL` accepts `trace`, `debug`, `info`, `warn`, `error`, `fatal` and `silent`.
- A task created through the API can no longer have a due date in the past. Updates and the CLI are unaffected.
- `npm run dev` pipes output through `pino-pretty`. Use `npm run dev:json` for raw lines.
### Added
- 555 tests (225 unit + 330 integration), including a persona-by-action access matrix, characterization tests for every rate limiter, and integration tests for logging with a leak test that proves secrets never reach the log
- Coverage report with ratcheted thresholds: 92.66% statements, 80.95% branches, 98.28% functions, 94.45% lines
- ESLint (flat config, type-aware rules, `no-restricted-imports` layering checks), Prettier, EditorConfig, Husky pre-commit and pre-push hooks, and `lint-staged`
- Structured logging with pino: request ids and user ids on every line via `AsyncLocalStorage`, secret redaction by field name, and a Prisma-safe error serializer
- OpenAPI linting with Redocly, generated operation ids, and documentation-drift tests that check `.env.example`, README commands and the changelog against the code
- `npm run precheck` (typecheck, lint, format, OpenAPI, unit tests, build) and `npm run ci` (precheck + coverage)
### Fixed
- Project slugs no longer end with a separator when truncated
- Graceful shutdown now handles a failing database disconnect
- `.env.example` uses standard `KEY=value` format for every variable
### Removed
- Hand-written scripts replaced by the suite: `test:tokens`, `test:auth-coverage`, `test:refresh`, `test:access`, `test:security` and `test:ratelimit`

## 0.4.0 - Authentication, authorization and hardening
### Breaking changes
- `/tasks` and `/projects` now require `Authorization: Bearer <access token>`.
- Comments no longer accept an `author` field; the author is the logged-in user.
- A project you are not a member of now answers `404` (it used to be readable by everyone).
### Added
- Registration, login, refresh token rotation with reuse detection, logout and logout-all
- Project roles (owner, member) with member management endpoints
- Rate limiting per IP, per account and per user; server timeouts; auth event logging
- Project slugs, task creators and comment authors
- `SECURITY.md`, Dependabot, `npm run verify`
### Fixed
- Out-of-range ids and NUL characters return `400` instead of `500`
- Accented characters in project slugs

## 0.3.0 - PostgreSQL
Prisma repositories, foreign-key integrity, SQL pagination with indexes, transactions, migrations and seed, Docker Compose database.

## 0.2.0 - REST API
Express API with validation, pagination and filtering, projects and comments, OpenAPI docs, Helmet, CORS and request IDs.

## 0.1.0 - CLI
TypeScript task manager with config validation, streams and a strict data model.