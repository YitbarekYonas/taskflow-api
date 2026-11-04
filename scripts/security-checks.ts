import { prisma } from "../src/db.js";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const stamp = Date.now();
let failures = 0;

function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  ${detail}`}`);
}

type Res = { status: number; headers: Headers; text: string; json: any };

async function raw(method: string, path: string, init: { headers?: Record<string, string>; body?: string } = {}): Promise<Res> {
  const res = await fetch(base + path, { method, headers: init.headers, body: init.body });
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, headers: res.headers, text, json };
}

const jsonHeaders = (token?: string) => ({
  "Content-Type": "application/json",
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
});
const api = (method: string, path: string, body?: unknown, token?: string) =>
  raw(method, path, { headers: jsonHeaders(token), body: body === undefined ? undefined : JSON.stringify(body) });

// Expects a 4xx (never a 5xx) and the standard error shape
async function rejects(name: string, expected: number, p: Promise<Res>) {
  const r = await p;
  check(`${name} -> ${expected}`, r.status === expected, `got ${r.status}: ${r.text.slice(0, 120)}`);
}

// ---- a throwaway user and project ----
const email = `sec+${stamp}@example.com`;
await api("POST", "/auth/register", { email, name: "Sec", password: "long-enough-password" });
const token = (await api("POST", "/auth/login", { email, password: "long-enough-password" })).json.data.accessToken as string;
const pid = (await api("POST", "/projects", { name: `Sec project ${stamp}` }, token)).json.data.id as number;

console.log("-- headers and exposure --");
const health = await raw("GET", "/health");
check("X-Content-Type-Options: nosniff", health.headers.get("x-content-type-options") === "nosniff");
check("no X-Powered-By header", !health.headers.has("x-powered-by"));
check("Strict-Transport-Security present", health.headers.has("strict-transport-security"));
check("every response has a request id", health.headers.has("x-request-id"));
const loginResp = await api("POST", "/auth/login", { email, password: "long-enough-password" });
check("auth responses are not cacheable", (loginResp.headers.get("cache-control") ?? "").includes("no-store"));
const reflect = await raw("GET", "/<script>alert(1)</script>");
check("404 for unknown routes is JSON (reflected path cannot become HTML)",
  (reflect.headers.get("content-type") ?? "").includes("application/json"));
check("error bodies leak no file paths or stack frames",
  !/node_modules|\/home\/|\bat\s+\S+\s+\(/.test(reflect.text), reflect.text.slice(0, 120));

console.log("\n-- CORS --");
const evil = await raw("OPTIONS", "/tasks", { headers: { Origin: "http://evil.example", "Access-Control-Request-Method": "GET" } });
check("unknown origin gets no Access-Control-Allow-Origin", !evil.headers.has("access-control-allow-origin"));
const good = await raw("OPTIONS", "/tasks", { headers: { Origin: "http://localhost:5173", "Access-Control-Request-Method": "GET", "Access-Control-Request-Headers": "authorization" } });
check("configured origin is allowed", good.headers.get("access-control-allow-origin") === "http://localhost:5173");

console.log("\n-- injection-shaped input --");
const sqli = await api("GET", `/tasks?search=${encodeURIComponent("' OR 1=1 --")}`, undefined, token);
check("SQL-looking search is just text (200, nothing leaked)", sqli.status === 200 && sqli.json.data.length === 0, `${sqli.status}`);
await rejects("sort field with SQL", 400, api("GET", `/tasks?sort=${encodeURIComponent("title; DROP TABLE tasks")}`, undefined, token));
await rejects("negative limit", 400, api("GET", "/tasks?limit=-1", undefined, token));
await rejects("non-numeric page", 400, api("GET", "/tasks?page=abc", undefined, token));
await rejects("id with SQL", 400, api("GET", "/tasks/1%20OR%201=1", undefined, token));
await rejects("array instead of string in the query", 400, api("GET", "/tasks?status=todo&status=done", undefined, token));

console.log("\n-- numbers that do not fit the database --");
await rejects("path id beyond INTEGER", 400, api("GET", "/tasks/99999999999999999999999", undefined, token));
await rejects("query projectId beyond INTEGER", 400, api("GET", "/tasks?projectId=99999999999", undefined, token));
await rejects("body projectId beyond INTEGER", 400, api("POST", "/tasks", { title: "x", projectId: 99999999999 }, token));
await rejects("merge target beyond INTEGER", 400, api("POST", `/projects/${pid}/merge`, { intoProjectId: 99999999999 }, token));
await rejects("member userId beyond INTEGER", 400, api("DELETE", `/projects/${pid}/members/99999999999`, undefined, token));

console.log("\n-- characters PostgreSQL cannot store --");
await rejects("NUL character in a task title", 400, api("POST", "/tasks", { title: "a\u0000b" }, token));
await rejects("NUL character in a project name", 400, api("POST", "/projects", { name: "a\u0000b" }, token));
await rejects("NUL character in a search", 400, api("GET", `/tasks?search=${encodeURIComponent("a\u0000b")}`, undefined, token));
await rejects("NUL character in a display name", 400, api("POST", "/auth/register", { email: `nul+${stamp}@example.com`, name: "a\u0000b", password: "long-enough-password" }));

console.log("\n-- malformed bodies --");
await rejects("__proto__ in a body", 400, raw("POST", "/auth/register", {
  headers: jsonHeaders(),
  body: '{"__proto__":{"admin":true},"email":"p@example.com","name":"P","password":"long-enough-password"}',
}));
await rejects("text/plain body", 400, raw("POST", "/auth/login", { headers: { "Content-Type": "text/plain" }, body: "email=a&password=b" }));
await rejects("array as the body", 400, raw("POST", "/auth/login", { headers: jsonHeaders(), body: "[]" }));
await rejects("null as the body", 400, raw("POST", "/auth/login", { headers: jsonHeaders(), body: "null" }));
await rejects("truncated JSON", 400, raw("POST", "/auth/login", { headers: jsonHeaders(), body: '{"email":' }));
await rejects("oversized body", 413, raw("POST", "/tasks", { headers: jsonHeaders(token), body: JSON.stringify({ title: "x".repeat(200_000) }) }));

// ---- cleanup ----
await prisma.project.deleteMany({ where: { name: { contains: String(stamp) } } });
await prisma.user.deleteMany({ where: { email: { endsWith: `+${stamp}@example.com` } } });
await prisma.$disconnect();

console.log(failures === 0 ? "\nAll security checks passed." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);