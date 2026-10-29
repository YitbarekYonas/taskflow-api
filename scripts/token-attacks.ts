import { SignJWT } from "jose";
import { config } from "../src/config.js";
import { prisma } from "../src/db.js";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const goodKey = new TextEncoder().encode(config.jwtSecret);
const otherKey = new TextEncoder().encode("a-completely-different-secret-32-chars!!");
const now = () => Math.floor(Date.now() / 1000);
let failures = 0;

async function me(token?: string) {
  const res = await fetch(`${base}/auth/me`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  return res.status;
}

async function expect(name: string, expected: number, token?: string) {
  const status = await me(token);
  const ok = status === expected;
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name} -> ${status} (expected ${expected})`);
}

const sign = (opts: {
  sub?: string; key?: Uint8Array; exp?: number; iss?: string; aud?: string; alg?: string;
}) => {
  let jwt = new SignJWT({})
    .setProtectedHeader({ alg: opts.alg ?? "HS256" })
    .setIssuer(opts.iss ?? "taskflow")
    .setAudience(opts.aud ?? "taskflow-api")
    .setIssuedAt()
    .setExpirationTime(opts.exp ?? now() + 600);
  if (opts.sub !== undefined) jwt = jwt.setSubject(opts.sub);
  return jwt.sign(opts.key ?? goodKey);
};

const email = `attack+${Date.now()}@example.com`;
const reg = await fetch(`${base}/auth/register`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, name: "Attack", password: "long-enough-password" }),
});
const userId = (await reg.json()).data.id as number;
const login = await fetch(`${base}/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, password: "long-enough-password" }),
});
const honest = (await login.json()).data.accessToken as string;
const [h, p, s] = honest.split(".");
const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
const payload = JSON.parse(Buffer.from(p, "base64url").toString());

await expect("honest token", 200, honest);
await expect("no token", 401);
await expect("garbage", 401, "not.a.token");
await expect("empty signature part", 401, `${h}.${p}.`);
await expect("expired 10s ago", 401, await sign({ sub: String(userId), exp: now() - 10 }));
await expect("signed with another secret", 401, await sign({ sub: String(userId), key: otherKey }));
await expect("tampered sub, old signature", 401, `${h}.${b64({ ...payload, sub: "1" })}.${s}`);
await expect("alg none", 401, `${b64({ alg: "none", typ: "JWT" })}.${p}.`);
await expect("alg HS512 (not on the allow-list)", 401, await sign({ sub: String(userId), alg: "HS512" }));
await expect("wrong audience", 401, await sign({ sub: String(userId), aud: "someone-else" }));
await expect("wrong issuer", 401, await sign({ sub: String(userId), iss: "evil" }));
await expect("missing sub", 401, await sign({}));
await expect("non-numeric sub", 401, await sign({ sub: "abc" }));
await expect("negative sub", 401, await sign({ sub: "-5" }));
await expect("valid signature, user does not exist", 401, await sign({ sub: "999999999" }));

await prisma.user.delete({ where: { id: userId } });
await expect("honest token after the user was deleted", 401, honest);

await prisma.$disconnect();
console.log(failures === 0 ? "\nAll attacks rejected." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);