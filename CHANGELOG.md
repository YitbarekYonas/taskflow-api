# Changelog

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