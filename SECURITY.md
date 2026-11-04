# Security

## Reporting a vulnerability
Please use GitHub's "Report a vulnerability" button on the Security tab (private reporting). Do not open a public issue.

## What TaskFlow does
| Area | Control |
|---|---|
| Passwords | Argon2id, never logged or returned |
| Sessions | 15-minute JWT access tokens; single-use rotating refresh tokens, stored hashed; reuse revokes the session family |
| Authorization | Per-project roles looked up on every request; strangers get 404 |
| Abuse | Rate limits per IP, account and user; request body limit; server timeouts |
| Input | Zod validation everywhere, strict objects, id and text range checks |
| Transport | Helmet headers, CORS allow-list (HTTPS must be provided by the deployment) |
| Operations | Required secrets validated at startup; auth events logged with request IDs |

## Known limitations
(Paste your honest list: in-memory rate limits, no email verification, no MFA, access tokens cannot be revoked before expiry, enumeration through member invites, ...)

## Operating it safely
- Set RATE_LIMIT_ENABLED=true, a strong JWT_SECRET, TRUST_PROXY_HOPS equal to your real proxy count, and run behind HTTPS.