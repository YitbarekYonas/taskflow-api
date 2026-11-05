# Threat Model

## Who, what, and how

| Who | Wants | How they might try | What stops them | What is left |
|---|---|---|---|---|
| Anonymous visitor | Read project data | Call `/tasks` without a token | `authenticate` on every data route; `test:auth-coverage` | nothing known |
| Logged-in stranger | See another team's tasks | Guess `/tasks/6` | Visibility in the query, `404` for outsiders; `test:access` | numeric IDs are guessable (harmless while everything is access-checked) |
| Attacker with a stolen refresh token | Keep access after the owner logs out | Replay the token | Rotation; reuse revokes the family | the stolen token works until the real user next refreshes |
| Attacker guessing passwords | Take over one account | Try common passwords repeatedly | Rate limiting on login; Argon2 hashing (slow) | no MFA; a botnet can still try slowly |
| Attacker flooding registration | Make the server unusable | Send thousands of `/auth/register` requests | Rate limiting per IP (5 per hour) | distributed IPs can bypass per-IP limits |
| Malicious project owner | Demote the real owner and take over | Send two demote requests simultaneously | Last-owner lock (`FOR UPDATE`) and double-check | only one owner can be demoted at a time |
| Attacker with database access | Read all user data | Steal a backup or SQL dump | None (no encryption at rest) | full database contents are exposed |
| Attacker with an XSS payload | Steal a session token | Inject JavaScript that reads `localStorage` | None (access token is in the response body) | token theft is possible if the client is compromised |
| Attacker probing login | Enumerate valid emails | Compare error messages or response times | Identical messages and dummy Argon2 hash | rate limiting slows but doesn't stop enumeration |
| Attacker exploiting a dependency | Run code on the server | Find a CVE in an npm package | Dependabot alerts; `npm audit` | zero-day vulnerabilities are unknown |

## Not defended today

- No MFA (multi-factor authentication)
- No email verification (accounts can be created with fake emails)
- No password reset flow
- No audit trail beyond application logs
- In-memory rate-limit counters (reset on restart, not shared across instances)
- Access tokens cannot be revoked before expiry (up to 15 minutes)
- No encryption at rest for the database
- No protection against a compromised server or database