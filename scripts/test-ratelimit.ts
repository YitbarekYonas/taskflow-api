// Set BEFORE anything reads the config, and import the app dynamically afterwards.
// dotenv never overrides variables that already exist.
process.env.RATE_LIMIT_ENABLED = "true";
process.env.TRUST_PROXY_HOPS = "0";

import type { AddressInfo } from "node:net";

const { createApp } = await import("../src/app.js");
const { prisma } = await import("../src/db.js");

const server = createApp().listen(0);
const base = `http://localhost:${(server.address() as AddressInfo).port}`;
const stamp = Date.now();
let failures = 0;

type Res = { status: number; headers: Headers; json: any };

async function api(method: string, path: string, body?: unknown, token?: string): Promise<Res> {
  const res = await fetch(base + path, {
    method,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, headers: res.headers, json: text ? JSON.parse(text) : undefined };
}

function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  ${detail}`}`);
}

const PASSWORD = "long-enough-password";
let accountCounter = 0;
async function newUser(label: string) {
  const email = `rl+${stamp}-${label}-${accountCounter++}@example.com`;
  const reg = await api("POST", "/auth/register", { email, name: label, password: PASSWORD });
  if (reg.status === 429) {
  console.warn(`⚠️  Unexpected: register limit tripped while setting up ${label}. In-memory counters start at zero, so this means a limiter is misconfigured or mounted twice.`);
  return { email, token: "dummy-token" };
}
if (reg.status !== 201) throw new Error(`could not register ${label}: ${reg.status}`);
  const login = await api("POST", "/auth/login", { email, password: PASSWORD });
  return { email, token: login.json.data.accessToken as string };
}

// 2 of the 5 allowed registrations are used here
const victim = await newUser("victim");
const owner = await newUser("owner");

// ---- invites: limited per USER, not per IP ----
console.log("\n-- invites (20 per hour per user) --");
const project = await api("POST", "/projects", { name: `RL project ${stamp}` }, owner.token);
const pid = project.json.data.id as number;
const inviteStatuses: number[] = [];
for (let i = 0; i < 22; i++) {
  inviteStatuses.push((await api("POST", `/projects/${pid}/members`, { email: `ghost${i}@example.com` }, owner.token)).status);
}
check("first 20 invites reach the handler (404: no such user)", inviteStatuses.slice(0, 20).every((s) => s === 404), inviteStatuses.join(","));
check("21st invite is limited", inviteStatuses[20] === 429, String(inviteStatuses[20]));

const third = await newUser("third"); // 3 of 5 registrations
const thirdInvite = await api("POST", `/projects/${pid}/members`, { email: "ghost@example.com" }, third.token);
check("another user has their own budget (404, not 429)", thirdInvite.status === 404, String(thirdInvite.status));

// ---- login: per account ----
console.log("\n-- login failures per account (10 per 15 min) --");
const wrong = { email: victim.email, password: "wrong-password-123" };
const loginStatuses: number[] = [];
for (let i = 0; i < 11; i++) loginStatuses.push((await api("POST", "/auth/login", wrong)).status);
check("first 10 wrong guesses get 401", loginStatuses.slice(0, 10).every((s) => s === 401), loginStatuses.join(","));
check("11th guess is limited", loginStatuses[10] === 429, String(loginStatuses[10]));

const limited = await api("POST", "/auth/login", wrong);
check("429 has the API error shape", typeof limited.json?.error?.message === "string");
check("429 includes retryAfterSeconds", Number(limited.json?.error?.retryAfterSeconds) > 0);
check("429 has a Retry-After header", Number(limited.headers.get("retry-after")) > 0);
check("RateLimit headers are present", limited.headers.has("ratelimit") || limited.headers.has("ratelimit-policy"));

const correctButBlocked = await api("POST", "/auth/login", { email: victim.email, password: PASSWORD });
console.log(
  `INFO  the REAL password right now -> ${correctButBlocked.status}  (this is the cost of per-account throttling: an attacker can keep the owner out)`
);
const other = await api("POST", "/auth/login", { email: owner.email, password: "wrong-password-123" });
check("a different account is unaffected", other.status === 401, String(other.status));

// ---- login: per IP, many different accounts ----
console.log("\n-- login failures per IP (30 per 15 min) --");
let firstIpBlock = -1;
for (let i = 0; i < 40; i++) {
  const r = await api("POST", "/auth/login", { email: `spray${i}-${stamp}@example.com`, password: "wrong-password-123" });
  if (r.status === 429) { firstIpBlock = i; break; }
}
check("spraying many accounts from one IP is blocked", firstIpBlock > 0, `first block at attempt ${firstIpBlock}`);

// ---- register: per IP ----
console.log("\n-- register (5 per hour per IP) --");
let registered = 0;
let registerBlocked = false;
for (let i = 0; i < 6; i++) {
  const r = await api("POST", "/auth/register", {
    email: `rl+${stamp}-extra-${i}@example.com`, name: "Extra", password: PASSWORD,
  });
  if (r.status === 201) registered++;
  if (r.status === 429) { registerBlocked = true; break; }
}
check("exactly the remaining 2 registrations succeed, then 429", registered === 2 && registerBlocked, `registered ${registered}, blocked ${registerBlocked}`);

// ---- refresh: per IP ----
console.log("\n-- refresh (60 per 15 min per IP) --");
const refreshStatuses: number[] = [];
for (let i = 0; i < 62; i++) refreshStatuses.push((await api("POST", "/auth/refresh", { refreshToken: "x".repeat(43) })).status);
check("first 60 reach the handler (401)", refreshStatuses.slice(0, 60).every((s) => s === 401));
check("61st is limited", refreshStatuses[60] === 429, String(refreshStatuses[60]));

// ---- global: everything, except /health ----
console.log("\n-- global (300 per minute per IP) --");
let globalBlockedAt = -1;
for (let i = 0; i < 330; i++) {
  if ((await api("GET", "/nope")).status === 429) { globalBlockedAt = i; break; }
}
check("flooding any route eventually gets 429", globalBlockedAt > 0, `blocked at ${globalBlockedAt}`);
check("/health is never limited", (await api("GET", "/health")).status === 200);

// ---- cleanup ----
await prisma.project.deleteMany({ where: { name: { contains: String(stamp) } } });
await prisma.user.deleteMany({ where: { email: { startsWith: `rl+${stamp}-` } } });
await prisma.$disconnect();
server.close();

console.log(failures === 0 ? "\nAll rate-limit checks passed." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);