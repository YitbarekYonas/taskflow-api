import process from "node:process";

const base = process.env.BASE_URL ?? "http://localhost:3000";
let failures = 0;

async function call(method: string, path: string, body?: unknown, extraHeaders: Record<string, string> = {}) {
  const hasBody = body !== undefined;
  const res = await fetch(base + path, {
    method,
    headers: { ...(hasBody ? { "Content-Type": "application/json" } : {}), ...extraHeaders },
    body: hasBody ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined,
  });
  const text = await res.text();
  return { status: res.status, headers: res.headers, json: text ? JSON.parse(text) : undefined };
}

function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  ${detail}`}`);
  if (!ok) failures++;
}

async function expectStatus(
  name: string, expected: number, method: string, path: string,
  body?: unknown, headers?: Record<string, string>
) {
  const r = await call(method, path, body, headers);
  check(`${method} ${path} -> ${expected} (${name})`, r.status === expected, `got ${r.status}`);
  if (expected >= 400) {
    check(`  error shape for "${name}"`, typeof r.json?.error?.message === "string", JSON.stringify(r.json));
  }
  return r;
}

// --- Happy path ---
await expectStatus("health", 200, "GET", "/health");
const project = await expectStatus("create project", 201, "POST", "/projects", { name: "Smoke project" });
const pid = project.json.data.id;
check("  project has a slug", typeof project.json.data.slug === "string" && project.json.data.slug.length > 0);

const task = await expectStatus("create task", 201, "POST", "/tasks", { title: "Smoke task", projectId: pid });
const tid = task.json.data.id;
check("  Location header on create", task.headers.get("location") === `/tasks/${tid}`);
await expectStatus("get task", 200, "GET", `/tasks/${tid}`);
const patched = await expectStatus("patch task", 200, "PATCH", `/tasks/${tid}`, { status: "done" });
check("  patch changed the status", patched.json.data.status === "done");

const list = await expectStatus("list with filters", 200, "GET", `/tasks?projectId=${pid}&limit=5`);
check("  list has meta.total >= 1", list.json.meta.total >= 1);

const p1 = await call("GET", "/tasks?sort=priority&order=desc&limit=5&page=1");
const p2 = await call("GET", "/tasks?sort=priority&order=desc&limit=5&page=2");
const pagedIds = [...p1.json.data, ...p2.json.data].map((t: { id: number }) => t.id);
check("  pages with many ties never overlap", new Set(pagedIds).size === pagedIds.length);

const comment = await expectStatus("add comment", 201, "POST", `/tasks/${tid}/comments`, { author: "Smoke", body: "Hello" });
const cid = comment.json.data.id;
await expectStatus("get comment", 200, "GET", `/tasks/${tid}/comments/${cid}`);

const projectTasks = await expectStatus("tasks of project", 200, "GET", `/projects/${pid}/tasks`);
check("  nested list contains the task", projectTasks.json.data.some((t: { id: number }) => t.id === tid));
await expectStatus("tasks of missing project", 404, "GET", "/projects/999999/tasks");

const projectList = await call("GET", "/projects");
const mine = projectList.json.data.find((p: { id: number }) => p.id === pid);
check("  project list has taskCount", mine?.taskCount === 1, JSON.stringify(mine));

// --- Registration ---
const stamp = Date.now();
const email = `smoke+${stamp}@example.com`;
const reg = await expectStatus("register", 201, "POST", "/auth/register", {
  email: ` Smoke+${stamp}@Example.com `, name: "Smoke", password: "smoke-test-password",
});
check("  email normalised", reg.json.data.email === email, JSON.stringify(reg.json));
check("  no password or hash in response", !JSON.stringify(reg.json).toLowerCase().includes("password"));
await expectStatus("duplicate email", 409, "POST", "/auth/register", {
  email: email.toUpperCase(), name: "Dup", password: "smoke-test-password",
});
await expectStatus("short password", 400, "POST", "/auth/register", { email: `x${stamp}@example.com`, name: "X", password: "short" });
await expectStatus("bad email", 400, "POST", "/auth/register", { email: "nope", name: "X", password: "smoke-test-password" });
await expectStatus("role injection", 400, "POST", "/auth/register", {
  email: `y${stamp}@example.com`, name: "Y", password: "smoke-test-password", role: "admin",
});

// --- Login and tokens ---
const goodLogin = await expectStatus("login", 200, "POST", "/auth/login", { email, password: "smoke-test-password" });
const token = goodLogin.json.data.accessToken as string;
check("  token is a string", typeof token === "string" && token.split(".").length === 3);
check("  expiresIn present", typeof goodLogin.json.data.expiresIn === "number");

const wrongPw = await expectStatus("wrong password", 401, "POST", "/auth/login", { email, password: "not-the-password" });
const noUser = await expectStatus("unknown email", 401, "POST", "/auth/login", { email: `nobody${stamp}@example.com`, password: "whatever-123" });
check("  both failures give the identical message", wrongPw.json.error.message === noUser.json.error.message);
await expectStatus("login without password", 400, "POST", "/auth/login", { email });

const meOk = await expectStatus("me with token", 200, "GET", "/auth/me", undefined, { Authorization: `Bearer ${token}` });
check("  me returns the same user", meOk.json.data.email === email);
const meNone = await expectStatus("me without token", 401, "GET", "/auth/me");
check("  WWW-Authenticate header present", (meNone.headers.get("www-authenticate") ?? "").includes("Bearer"));
await expectStatus("me with garbage token", 401, "GET", "/auth/me", undefined, { Authorization: "Bearer garbage" });

// --- Rules and failures ---
await expectStatus("project with tasks cannot be deleted", 409, "DELETE", `/projects/${pid}`);
await expectStatus("empty title", 400, "POST", "/tasks", { title: "" });
await expectStatus("unknown field", 400, "POST", "/tasks", { title: "x", id: 1 });
await expectStatus("malformed JSON", 400, "POST", "/tasks", "{bad json");
await expectStatus("limit too large", 400, "GET", "/tasks?limit=1000");
await expectStatus("non-numeric id", 400, "GET", "/tasks/abc");
await expectStatus("empty patch", 400, "PATCH", `/tasks/${tid}`, {});
await expectStatus("task in missing project", 400, "POST", "/tasks", { title: "x", projectId: 999999 });
await expectStatus("missing task", 404, "GET", "/tasks/999999");
await expectStatus("unknown route", 404, "GET", "/nope");

// --- Ownership: a comment must not be reachable through a different task ---
const other = await expectStatus("create second task", 201, "POST", "/tasks", { title: "Other task" });
const oid = other.json.data.id;
await expectStatus("comment via wrong task", 404, "GET", `/tasks/${oid}/comments/${cid}`);

// --- Transactions: duplicate and merge ---
const a = (await expectStatus("tx: create project A", 201, "POST", "/projects", { name: "Merge A" })).json.data.id;
const b = (await expectStatus("tx: create project B", 201, "POST", "/projects", { name: "Merge B" })).json.data.id;
const at = (await expectStatus("tx: task in A", 201, "POST", "/tasks", { title: "Move me", projectId: a })).json.data.id;

const dup = await expectStatus("duplicate A", 201, "POST", `/projects/${a}/duplicate`, { name: "Merge A copy" });
check("  duplicate copied 1 task", dup.json.data.copiedTasks === 1, JSON.stringify(dup.json));
check("  Location points to the copy", dup.headers.get("location") === `/projects/${dup.json.data.project.id}`);
const copyId = dup.json.data.project.id;

await expectStatus("merge into itself", 400, "POST", `/projects/${a}/merge`, { intoProjectId: a });
await expectStatus("merge into missing project", 400, "POST", `/projects/${a}/merge`, { intoProjectId: 999999 });
await expectStatus("merge missing source", 404, "POST", "/projects/999999/merge", { intoProjectId: b });
const merged = await expectStatus("merge A into B", 200, "POST", `/projects/${a}/merge`, { intoProjectId: b });
check("  moved 1 task", merged.json.data.movedTasks === 1, JSON.stringify(merged.json));
await expectStatus("source gone after merge", 404, "GET", `/projects/${a}`);
const inB = await call("GET", `/tasks?projectId=${b}`);
check("  B now holds the task", inB.json.data.some((t: { id: number }) => t.id === at));

// --- Cleanup (and cascade check) ---
await expectStatus("delete other task", 204, "DELETE", `/tasks/${oid}`);
await expectStatus("delete task", 204, "DELETE", `/tasks/${tid}`);
await expectStatus("deleted task again", 404, "DELETE", `/tasks/${tid}`);
await expectStatus("comments of deleted task", 404, "GET", `/tasks/${tid}/comments`);
await expectStatus("delete project", 204, "DELETE", `/projects/${pid}`);

const copyTasks = await call("GET", `/tasks?projectId=${copyId}`);
for (const t of copyTasks.json.data) await call("DELETE", `/tasks/${t.id}`);
await expectStatus("cleanup copy", 204, "DELETE", `/projects/${copyId}`);
await call("DELETE", `/tasks/${at}`);
await expectStatus("cleanup B", 204, "DELETE", `/projects/${b}`);

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);