// Post-build smoke test: does the COMPILED server answer real HTTP? Detailed behavior lives in `npm test`.
const base = process.env.BASE_URL ?? "http://localhost:3000";
let failures = 0;

function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  ${detail}`}`);
  if (!ok) failures++;
}

async function call(method: string, path: string, body?: unknown, token?: string) {
  const res = await fetch(base + path, {
    method,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : undefined };
}

const stamp = Date.now();
const email = `smoke+${stamp}@example.com`;
const password = "smoke-test-password";

check("health", (await call("GET", "/health")).status === 200);
check("docs page", (await fetch(`${base}/docs/`)).status === 200);
check("tasks need a login", (await call("GET", "/tasks")).status === 401);

check(
  "register",
  (await call("POST", "/auth/register", { email, name: "Smoke", password })).status === 201,
);
const login = await call("POST", "/auth/login", { email, password });
check("login", login.status === 200, JSON.stringify(login.json));
const token = login.json?.data?.accessToken as string;
check("me", (await call("GET", "/auth/me", undefined, token)).json?.data?.email === email);

const project = await call("POST", "/projects", { name: `Smoke ${stamp}` }, token);
check("create project", project.status === 201);
const projectId = project.json?.data?.id;
const task = await call("POST", "/tasks", { title: "Smoke task", projectId }, token);
check("create task", task.status === 201);
const taskId = task.json?.data?.id;
const list = await call("GET", `/tasks?projectId=${projectId}`, undefined, token);
check("list shows the task", list.json?.meta?.total === 1);
check(
  "update task",
  (await call("PATCH", `/tasks/${taskId}`, { status: "done" }, token)).status === 200,
);
check("delete task", (await call("DELETE", `/tasks/${taskId}`, undefined, token)).status === 204);
check(
  "delete project",
  (await call("DELETE", `/projects/${projectId}`, undefined, token)).status === 204,
);

console.log(failures === 0 ? "\nSmoke test passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);

export {};
