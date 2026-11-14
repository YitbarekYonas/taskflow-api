# Security

## Reporting a vulnerability
Please use GitHub's "Report a vulnerability" button on the Security tab (private reporting). Do not open a public issue.

## What TaskFlow does
| Area | Control |
|---|---|
| Passwords | Argon2id, never logged or returned |
| Sessions | 15-minute JWT access tokens; single-use rotating refresh tokens, stored hashed; reuse revokes the session family |
| Authorization | Per-project roles looked up on every request; strangers get 404 |
| Abuse | Rate limits per IP, account and user, **with counters shared across instances in Redis**; request body limit; server timeouts |
| Input | Zod validation everywhere, strict objects, id and text range checks |
| Transport | Helmet headers, CORS allow-list (HTTPS must be provided by the deployment) |
| Operations | Required secrets validated at startup; auth events logged with request IDs |

## Known limitations

- **In-memory rate limits when Redis is not configured:** With `REDIS_URL` empty, counters live in each process's memory. They reset on restart and don't share between instances. **Production refuses to start without `REDIS_URL`**; the fallback is development-only.
- **During a Redis outage, rate limits degrade to per-instance:** `ResilientStore` falls back to `MemoryStore`, so an attacker facing `N` instances gets `N ×` the budget until Redis recovers. `/ready` reports `degraded` and `rate_limit.store_fallback` is logged (once per 30 s per limiter), but the weakened limit is real for the duration. Fail closed would turn a Redis outage into a full login outage; fail open would remove the limit entirely. Degrade is the deliberate middle ground.
- **Fixed-window rate limiting allows a burst at the window boundary:** A client can make `limit` requests at the end of one window and `limit` at the start of the next, getting `2 × limit` in a short span. Sliding-window is a later improvement.
- **`ipKeyGenerator` normalizes IPv6 to a `/56` subnet:** Two clients in the same block share a budget. That is the intended defense against rotating through addresses, but one abusive client in a shared `/56` can rate-limit its neighbors.
- **No email verification:** Accounts can be created with fake emails. Week 6 adds verification and password reset.
- **No MFA:** A determined attacker with a botnet can still try many passwords against a compromised or reused password. Rate limiting and the per-account lockout raise the cost but do not eliminate the risk.
- **No CAPTCHA:** Bot traffic that respects nothing but the rate limits can still consume the budget, though the 429 is the limit of what the app can do on its own.
- **Access tokens cannot be revoked before expiry:** A stolen access token stays valid for up to 15 minutes after logout. `auth.sessions.test.ts` locks this in as a characterization test.
- **Per-account throttle can be abused for lockout:** An attacker can flood `/auth/login` with wrong passwords until the victim's account is throttled (`429`). Rate limiting makes probing slow, but cannot distinguish an attacker from a victim.
- **Enumeration through member invites:** Adding a member by email returns `404` if the user doesn't exist and `201` (or `409`) if they do. An owner can learn which emails have accounts, slowly (rate-limited) but reliably.
- **`/ready` is public and reveals dependency state:** It returns `checks.database` and `checks.redis` to anyone who asks. Acceptable behind a load balancer; on a public API it should be restricted to the infrastructure (header check, or a private port). The field shape is intentionally minimal — no versions, no hostnames, no credentials.
- **Redis is unauthenticated and unencrypted in development:** The `docker-compose.yml` instance is bound to `127.0.0.1` (not reachable from the network) but has no password and no TLS. A shared or remote Redis must run with `requirepass`/ACLs and TLS (`rediss://…`). The app supports both via `REDIS_URL`; the development compose file does not, and is not intended to.
- **No Redis authentication enforcement at startup:** The config validates the URL starts with `redis`, but does not require a password. Production operators must set one in `REDIS_URL`; the app cannot tell whether it is present.
- **No user data in Redis keys:** The per-account limiter hashes the email before it becomes part of a key. Any future limiter that uses user-supplied data in a key must do the same — Redis keys are readable by anyone who can run `MONITOR` or `KEYS`, and the app cannot redact them once they are written.
- **The in-memory fallback's counters reset on process restart:** During a Redis outage, if the app is also restarted, per-instance counters start at zero again. Same limitation as pre-Day-36 rate limits, scoped to outages.
- **No contract test between the OpenAPI document and real responses:** Redocly lints the spec and `docs.and.auth.test.ts` checks `operationId`/401 coverage, but no test validates a real response body against the spec's schema. A future Ajv-based test would close this.
- **No load testing:** Nothing measures the API under concurrency or sustained load. Week 7 adds a minimal load check against the deployed build.
- **No CI yet:** Only `npm run ci` on a fresh checkout is a real gate; local hooks can be bypassed with `--no-verify`. Week 7 adds a GitHub Actions pipeline that runs the same command.
- **No alerting:** `auth.refresh_reuse`, `rate_limit.store_fallback`, 5xx, and rate-limit hits are logged (JSON on stdout) but nothing watches them. A real deployment needs an aggregator and alerts.
- **Prisma's own query log bypasses pino:** With `LOG_LEVEL=debug`, SQL is written by Prisma in its own format on stdout. Query arguments can appear there; do not run `LOG_LEVEL=debug` in production.
- **Redaction is by key name only:** A secret inside a message string, under an unlisted key (`pwd`, `rawToken`), or nested deeper than the configured paths is not redacted. Defense #1 is not putting the secret in the log call; the integration leak test is the second line.
- **`/health` is liveness only, by design:** It doesn't touch any dependency. `/ready` is the readiness probe that checks the database and reports Redis.

## Operating it safely
- Set `RATE_LIMIT_ENABLED=true`, a strong `JWT_SECRET`, `TRUST_PROXY_HOPS` equal to your real proxy count, and run behind HTTPS.
- **Set `REDIS_URL`.** The app refuses to start in production without it, because rate-limit counters must be shared across instances. Development falls back to per-instance in-memory counters when `REDIS_URL` is empty; that fallback is weaker (an attacker facing N instances gets N × the budget) and is not acceptable in production.
- **Redis must be private, authenticated, and encrypted.** Do not publish its port. In a Docker or Kubernetes deployment, put it on an internal network (not `ports:` in a compose file that faces the internet — bind to `127.0.0.1` or a private network). Use `requirepass` (or Redis ACLs) and enable TLS (`rediss://…` in `REDIS_URL`). The development `docker-compose.yml` uses an **unauthenticated, unencrypted** Redis bound to `127.0.0.1`; that is acceptable for a laptop, **never** for a shared or remote instance.
- **Do not put user data in Redis keys.** Anyone who can run `MONITOR` or `KEYS` can read them. The per-account rate limiter hashes the email (`sha256(...).slice(0, 32)`) before using it in a key; any new limiter must follow the same rule.
- **Redis is a dependency you must monitor.** `/ready` reports `degraded` when Redis is down (it returns `200`, because the app can still serve — but limits weaken to per-instance until recovery). Alert on `degraded` lasting more than a few seconds and on `rate_limit.store_fallback` events.
- **`/ready` is a public endpoint.** It returns `checks.database` and `checks.redis` to anyone who asks. Behind a load balancer this is fine; on a public API, restrict it to the infrastructure (a header check, or a private port). The response shape is intentionally minimal — no versions, no hostnames, no credentials.
- **Rotate the Redis password like any other secret.** It lives in `REDIS_URL`; redaction covers `REDIS_URL` via the `databaseUrl` key name only if you spell it that way in a log call. Do not log the URL; the request logger records the **path**, not the connection string, and the Redis client logs errors without echoing `REDIS_URL`. A password that does leak into a log line is caught by the integration leak test only if it matches one of the values the test pushes through the API — so the rule is **do not log the URL**.