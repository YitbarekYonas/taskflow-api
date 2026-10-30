import { openApiSpec } from "../src/docs/openapi.js";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const PUBLIC = new Set(["GET /health", "POST /auth/register", "POST /auth/login"]);
const METHODS = ["get", "post", "put", "patch", "delete"];
let failures = 0;
let checked = 0;

function report(ok: boolean, line: string) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${line}`);
}

for (const [path, item] of Object.entries(openApiSpec.paths) as [string, Record<string, unknown>][]) {
  for (const method of METHODS) {
    if (!(method in item)) continue;
    const key = `${method.toUpperCase()} ${path}`;
    const url = base + path.replace(/\{[^}]+\}/g, "1");
    const hasBody = method === "post" || method === "patch" || method === "put";
    const res = await fetch(url, {
      method: method.toUpperCase(),
      headers: hasBody ? { "Content-Type": "application/json" } : undefined,
      body: hasBody ? "{}" : undefined,
    });
    checked++;
    report(
      PUBLIC.has(key) ? res.status !== 401 : res.status === 401,
      `${key} -> ${res.status} ${PUBLIC.has(key) ? "(public)" : "(must be 401)"}`
    );
  }
}

for (const path of ["/docs", "/openapi.json"]) {
  const res = await fetch(base + path);
  report(res.status === 200, `GET ${path} -> ${res.status} (public)`);
}

console.log(failures === 0 ? `\nAll ${checked} operations behave as documented.` : `\n${failures} FAILED.`);
process.exit(failures === 0 ? 0 : 1);