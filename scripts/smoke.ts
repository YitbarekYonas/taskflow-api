const base = globalThis.process.env.BASE_URL ?? "http://localhost:3000";
let failures = 0;

async function call(method: string, path: string, body?: unknown) {
  const hasBody = body !== undefined;
  const res = await fetch(base + path, {
    method,
    headers: hasBody ? { "Content-Type": "application/json" } : undefined,
    // a string body is sent as-is, which lets us send deliberately broken JSON
    body: hasBody ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined,
  });
  const text = await res.text();
  return {
    status: res.status,
    headers: res.headers,
    json: text ? JSON.parse(text) : undefined,
  };
}

function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  ${detail}`}`);
  if (!ok) failures++;
}

// Calls an endpoint and checks the status. Failures must also use the shared error shape.
async function expectStatus(name: string, expected: number, method: string, path: string, body?: unknown) {
  const r = await call(method, path, body);
  check(`${method} ${path} -> ${expected} (${name})`, r.status === expected, `got ${r.status}`);
  if (expected >= 400) {
    check(`  error shape for "${name}"`, typeof r.json?.error?.message === "string", JSON.stringify(r.json));
  }
  return r;
}

// Happy path
await expectStatus("health", 200, "GET", "/health");
const project = await expectStatus("create project", 201, "POST", "/projects", { name: "Smoke project" });
const pid = project.json.data.id;
const task = await expectStatus("create task", 201, "POST", "/tasks", { title: "Smoke task", projectId: pid });
const tid = task.json.data.id;
check("  Location header on create", task.headers.get("location") === `/tasks/${tid}`);
await expectStatus("get task", 200, "GET", `/tasks/${tid}`);
const patched = await expectStatus("patch task", 200, "PATCH", `/tasks/${tid}`, { status: "done" });
check("  patch changed the status", patched.json.data.status === "done");
const list = await expectStatus("list with filters", 200, "GET", `/tasks?projectId=${pid}&limit=5`);
check("  list has meta.total >= 1", list.json.meta.total >= 1);
const comment = await expectStatus("add comment", 201, "POST", `/tasks/${tid}/comments`, { author: "Smoke", body: "Hello" });
const cid = comment.json.data.id;
await expectStatus("get comment", 200, "GET", `/tasks/${tid}/comments/${cid}`);

// Rules and failures
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

// Ownership: a comment must not be reachable through a different task
const other = await expectStatus("create second task", 201, "POST", "/tasks", { title: "Other task" });
const oid = other.json.data.id;
await expectStatus("comment via wrong task", 404, "GET", `/tasks/${oid}/comments/${cid}`);

// Cleanup (and cascade check)
await expectStatus("delete other task", 204, "DELETE", `/tasks/${oid}`);
await expectStatus("delete task", 204, "DELETE", `/tasks/${tid}`);
await expectStatus("deleted task again", 404, "DELETE", `/tasks/${tid}`);
await expectStatus("comments of deleted task", 404, "GET", `/tasks/${tid}/comments`);
await expectStatus("delete project", 204, "DELETE", `/projects/${pid}`);

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);