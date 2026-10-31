import { hashRefreshToken } from "../src/auth/refreshTokens.js";
import { authService } from "../src/container.js";
import { prisma } from "../src/db.js";

const base = process.env.BASE_URL ?? "http://localhost:3000";
let failures = 0;

function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  ${detail}`}`);
  if (!ok) failures++;
}

async function post(path: string, body?: unknown, token?: string) {
  const res = await fetch(base + path, {
    method: "POST",
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : undefined };
}
async function me(token: string) {
  return (await fetch(`${base}/auth/me`, { headers: { Authorization: `Bearer ${token}` } })).status;
}

async function newSession() {
  const email = `refresh+${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`;
  const password = "long-enough-password";
  const reg = await post("/auth/register", { email, name: "Refresh", password });
  const login = await post("/auth/login", { email, password });
  return { email, password, userId: reg.json.data.id as number, ...login.json.data };
}

// 1. The happy path and rotation
const s = await newSession();
check("login returns a refresh token", typeof s.refreshToken === "string" && s.refreshToken.length > 20);
check("login returns refreshExpiresIn", typeof s.refreshExpiresIn === "number");
check("access token works", (await me(s.accessToken)) === 200);

const r1 = await post("/auth/refresh", { refreshToken: s.refreshToken });
check("refresh -> 200", r1.status === 200, String(r1.status));
check("refresh token is rotated", r1.json.data.refreshToken !== s.refreshToken);
check("new access token works", (await me(r1.json.data.accessToken)) === 200);

// 2. The database never holds the real token
check(
  "raw token is not stored",
  (await prisma.refreshToken.findFirst({ where: { tokenHash: s.refreshToken } })) === null
);
check(
  "its hash is stored",
  (await prisma.refreshToken.findFirst({ where: { tokenHash: hashRefreshToken(s.refreshToken) } })) !== null
);

// 3. Replay of the old token kills the family
const replay = await post("/auth/refresh", { refreshToken: s.refreshToken });
check("replaying the old token -> 401", replay.status === 401, String(replay.status));
const afterReplay = await post("/auth/refresh", { refreshToken: r1.json.data.refreshToken });
check("the newer token in the family is dead too", afterReplay.status === 401, String(afterReplay.status));

// 4. Logout
const s2 = await newSession();
check("logout -> 204", (await post("/auth/logout", { refreshToken: s2.refreshToken })).status === 204);
check("refresh after logout -> 401", (await post("/auth/refresh", { refreshToken: s2.refreshToken })).status === 401);
check("logout again is still 204", (await post("/auth/logout", { refreshToken: s2.refreshToken })).status === 204);
check("logout with garbage is 204 too", (await post("/auth/logout", { refreshToken: "x".repeat(43) })).status === 204);
console.log(
  `INFO  access token after logout -> ${await me(s2.accessToken)} (stays valid until it expires: the known limit of stateless tokens)`
);

// 5. logout-all ends every session of one user
const s3 = await newSession();
const second = await post("/auth/login", { email: s3.email, password: s3.password });
check("logout-all needs a token", (await post("/auth/logout-all")).status === 401);
check("logout-all -> 204", (await post("/auth/logout-all", undefined, s3.accessToken)).status === 204);
check("device 1 is logged out", (await post("/auth/refresh", { refreshToken: s3.refreshToken })).status === 401);
check("device 2 is logged out", (await post("/auth/refresh", { refreshToken: second.json.data.refreshToken })).status === 401);

// 6. Parallel refreshes with one token: exactly one winner
const s4 = await newSession();
const parallel = await Promise.all(
  Array.from({ length: 6 }, () => post("/auth/refresh", { refreshToken: s4.refreshToken }))
);
const winners = parallel.filter((r) => r.status === 200).length;
check("exactly one of 6 parallel refreshes succeeds", winners === 1, `winners: ${winners}`);

// 7. Expired tokens are rejected, then purged
const s5 = await newSession();
const expiredRaw = "expired-token-for-testing-" + Date.now();
await prisma.refreshToken.create({
  data: {
    userId: s5.userId,
    tokenHash: hashRefreshToken(expiredRaw),
    familyId: "expired-family",
    expiresAt: new Date(Date.now() - 60_000),
  },
});
check("expired token -> 401", (await post("/auth/refresh", { refreshToken: expiredRaw })).status === 401);
await authService.purgeExpired();
check(
  "expired row was purged",
  (await prisma.refreshToken.findFirst({ where: { tokenHash: hashRefreshToken(expiredRaw) } })) === null
);
check(
  "unexpired rows were kept",
  (await prisma.refreshToken.findFirst({ where: { tokenHash: hashRefreshToken(s5.refreshToken) } })) !== null
);

// 8. A deleted user's sessions die with them (cascade)
const s6 = await newSession();
await prisma.user.delete({ where: { id: s6.userId } });
check("refresh after the user was deleted -> 401", (await post("/auth/refresh", { refreshToken: s6.refreshToken })).status === 401);

// 9. Input validation
check("refresh with no body -> 400", (await post("/auth/refresh", {})).status === 400);
check("refresh with a short token -> 400", (await post("/auth/refresh", { refreshToken: "abc" })).status === 400);
check("refresh with an unknown extra field -> 400", (await post("/auth/refresh", { refreshToken: "x".repeat(43), admin: true })).status === 400);

// Cleanup test users
await prisma.user.deleteMany({ where: { email: { startsWith: "refresh+" } } });
await prisma.$disconnect();
console.log(failures === 0 ? "\nAll refresh checks passed." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);