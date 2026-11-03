import { prisma } from "../src/db.js";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const stamp = Date.now();
let failures = 0;

type Res = { status: number; json: any };

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
  return { status: res.status, json: text ? JSON.parse(text) : undefined };
}

async function expectStatus(
  name: string, expected: number, method: string, path: string, body?: unknown, token?: string
) {
  const r = await api(method, path, body, token);
  const ok = r.status === expected;
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}: ${method} ${path} -> ${r.status}${ok ? "" : ` (expected ${expected})`}`);
  return r;
}

function check(name: string, ok: boolean) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
}

async function persona(label: string) {
  const email = `${label}+${stamp}@example.com`;
  const password = "long-enough-password";
  const reg = await api("POST", "/auth/register", { email, name: label, password });
  const login = await api("POST", "/auth/login", { email, password });
  return { id: reg.json.data.id as number, email, token: login.json.data.accessToken as string };
}

const olga = await persona("olga"); // owner
const max = await persona("max");   // member
const sid = await persona("sid");   // stranger

// ---- setup ----
const P = (await api("POST", "/projects", { name: `Access test ${stamp}` }, olga.token)).json.data.id as number;
await expectStatus("owner adds Max as member", 201, "POST", `/projects/${P}/members`, { email: max.email }, olga.token);
const T = (await api("POST", "/tasks", { title: "Olga's task", projectId: P }, olga.token)).json.data.id as number;
const T2 = (await api("POST", "/tasks", { title: "Max's task", projectId: P }, max.token)).json.data.id as number;
const PT = (await api("POST", "/tasks", { title: "Olga personal" }, olga.token)).json.data.id as number;
const C = (await api("POST", `/tasks/${T}/comments`, { body: "Olga's comment" }, olga.token)).json.data.id as number;

// ---- the stranger sees and changes nothing ----
console.log("\n-- stranger (Sid) --");
await expectStatus("read project", 404, "GET", `/projects/${P}`, undefined, sid.token);
await expectStatus("list members", 404, "GET", `/projects/${P}/members`, undefined, sid.token);
await expectStatus("tasks of project", 404, "GET", `/projects/${P}/tasks`, undefined, sid.token);
await expectStatus("rename project", 404, "PATCH", `/projects/${P}`, { name: "Mine" }, sid.token);
await expectStatus("delete project", 404, "DELETE", `/projects/${P}`, undefined, sid.token);
await expectStatus("duplicate project", 404, "POST", `/projects/${P}/duplicate`, undefined, sid.token);
await expectStatus("merge project", 404, "POST", `/projects/${P}/merge`, { intoProjectId: P + 1 }, sid.token);
await expectStatus("add himself as member", 404, "POST", `/projects/${P}/members`, { email: sid.email }, sid.token);
await expectStatus("promote himself", 404, "PATCH", `/projects/${P}/members/${sid.id}`, { role: "owner" }, sid.token);
await expectStatus("read a task", 404, "GET", `/tasks/${T}`, undefined, sid.token);
await expectStatus("patch a task", 404, "PATCH", `/tasks/${T}`, { title: "x" }, sid.token);
await expectStatus("delete a task", 404, "DELETE", `/tasks/${T}`, undefined, sid.token);
await expectStatus("read a personal task", 404, "GET", `/tasks/${PT}`, undefined, sid.token);
await expectStatus("create a task in the project", 400, "POST", "/tasks", { title: "x", projectId: P }, sid.token);
await expectStatus("list comments", 404, "GET", `/tasks/${T}/comments`, undefined, sid.token);
await expectStatus("add a comment", 404, "POST", `/tasks/${T}/comments`, { body: "x" }, sid.token);
const sidTasks = await api("GET", `/tasks?limit=100&search=${encodeURIComponent("task")}`, undefined, sid.token);
check("task list hides everything", sidTasks.json.data.length === 0 && sidTasks.json.meta.total === 0);
const sidFiltered = await api("GET", `/tasks?projectId=${P}`, undefined, sid.token);
check("filtering by a foreign project returns nothing", sidFiltered.json.data.length === 0);
const sidProjects = await api("GET", "/projects", undefined, sid.token);
check("project list hides it", !sidProjects.json.data.some((p: { id: number }) => p.id === P));

// ---- the plain member ----
console.log("\n-- member (Max) --");
await expectStatus("read project", 200, "GET", `/projects/${P}`, undefined, max.token);
await expectStatus("list members", 200, "GET", `/projects/${P}/members`, undefined, max.token);
const maxTasks = await api("GET", "/tasks?limit=100", undefined, max.token);
const maxIds = maxTasks.json.data.map((t: { id: number }) => t.id);
check("sees project tasks, not Olga's personal one", maxIds.includes(T) && maxIds.includes(T2) && !maxIds.includes(PT));
await expectStatus("read Olga's personal task", 404, "GET", `/tasks/${PT}`, undefined, max.token);
await expectStatus("edit someone else's task", 200, "PATCH", `/tasks/${T}`, { status: "in_progress" }, max.token);
await expectStatus("move someone else's task out", 403, "PATCH", `/tasks/${T}`, { projectId: null }, max.token);
await expectStatus("delete someone else's task", 403, "DELETE", `/tasks/${T}`, undefined, max.token);
await expectStatus("rename project", 403, "PATCH", `/projects/${P}`, { name: "Mine" }, max.token);
await expectStatus("delete project", 403, "DELETE", `/projects/${P}`, undefined, max.token);
await expectStatus("merge project", 403, "POST", `/projects/${P}/merge`, { intoProjectId: P + 1 }, max.token);
await expectStatus("add a member", 403, "POST", `/projects/${P}/members`, { email: sid.email }, max.token);
await expectStatus("promote himself", 403, "PATCH", `/projects/${P}/members/${max.id}`, { role: "owner" }, max.token);
await expectStatus("remove Olga", 403, "DELETE", `/projects/${P}/members/${olga.id}`, undefined, max.token);
await expectStatus("edit Olga's comment", 403, "PATCH", `/tasks/${T}/comments/${C}`, { body: "forged" }, max.token);
await expectStatus("delete Olga's comment", 403, "DELETE", `/tasks/${T}/comments/${C}`, undefined, max.token);
const own = await expectStatus("comment as himself", 201, "POST", `/tasks/${T}/comments`, { body: "Max here" }, max.token);
check("authorId comes from the token", own.json.data.authorId === max.id);
check("author name comes from the account", own.json.data.author === "max");
await expectStatus("author in the body is rejected", 400, "POST", `/tasks/${T}/comments`, { body: "x", author: "Olga" }, max.token);
await expectStatus("edit own comment", 200, "PATCH", `/tasks/${T}/comments/${own.json.data.id}`, { body: "Max edited" }, max.token);
await expectStatus("delete own comment", 204, "DELETE", `/tasks/${T}/comments/${own.json.data.id}`, undefined, max.token);
await expectStatus("delete own task", 204, "DELETE", `/tasks/${T2}`, undefined, max.token);

// ---- the owner ----
console.log("\n-- owner (Olga) --");
const T3 = (await api("POST", "/tasks", { title: "Max's second task", projectId: P }, max.token)).json.data.id as number;
const C2 = (await api("POST", `/tasks/${T}/comments`, { body: "Max again" }, max.token)).json.data.id as number;
await expectStatus("delete Max's task", 204, "DELETE", `/tasks/${T3}`, undefined, olga.token);
await expectStatus("delete Max's comment", 204, "DELETE", `/tasks/${T}/comments/${C2}`, undefined, olga.token);
await expectStatus("owner cannot edit Max's comment", 403, "PATCH", `/tasks/${T}/comments/${C}`, { body: "x" }, olga.token);
await expectStatus("add an existing member again", 409, "POST", `/projects/${P}/members`, { email: max.email }, olga.token);
await expectStatus("add an unknown email", 404, "POST", `/projects/${P}/members`, { email: `nobody+${stamp}@example.com` }, olga.token);
await expectStatus("promote Max", 200, "PATCH", `/projects/${P}/members/${max.id}`, { role: "owner" }, olga.token);
await expectStatus("demote Max again", 200, "PATCH", `/projects/${P}/members/${max.id}`, { role: "member" }, olga.token);
await expectStatus("last owner cannot demote herself", 409, "PATCH", `/projects/${P}/members/${olga.id}`, { role: "member" }, olga.token);
await expectStatus("last owner cannot leave", 409, "DELETE", `/projects/${P}/members/${olga.id}`, undefined, olga.token);
await expectStatus("remove Max", 204, "DELETE", `/projects/${P}/members/${max.id}`, undefined, olga.token);
await expectStatus("Max loses access immediately", 404, "GET", `/projects/${P}`, undefined, max.token);
await expectStatus("Max's old tasks are gone from his view", 404, "GET", `/tasks/${T}`, undefined, max.token);

// ---- a member may leave ----
await expectStatus("owner re-adds Max", 201, "POST", `/projects/${P}/members`, { email: max.email }, olga.token);
await expectStatus("Max leaves", 204, "DELETE", `/projects/${P}/members/${max.id}`, undefined, max.token);
await expectStatus("Max is a stranger again", 404, "GET", `/projects/${P}`, undefined, max.token);

// ---- the "last owner" invariant under concurrency ----
console.log("\n-- two owners demote each other at the same moment (15 rounds) --");
let zeroOwners = 0;
let bothSucceeded = 0;
for (let round = 0; round < 15; round++) {
  const p = (await api("POST", "/projects", { name: `Race ${round} ${stamp}` }, olga.token)).json.data.id as number;
  await api("POST", `/projects/${p}/members`, { email: max.email, role: "owner" }, olga.token);
  const [a, b] = await Promise.all([
    api("PATCH", `/projects/${p}/members/${max.id}`, { role: "member" }, olga.token),
    api("PATCH", `/projects/${p}/members/${olga.id}`, { role: "member" }, max.token),
  ]);
  const list = await api("GET", `/projects/${p}/members`, undefined, olga.token);
  const owners = list.json.data.filter((m: { role: string }) => m.role === "owner").length;
  if (owners === 0) zeroOwners++;
  if (a.status === 200 && b.status === 200) bothSucceeded++;
}
check(`never a project without an owner (${zeroOwners} violations)`, zeroOwners === 0);
check(`never both demotions succeed (${bothSucceeded} times)`, bothSucceeded === 0);

// ---- cleanup (direct database access: tasks before projects, projects before users) ----
await prisma.task.deleteMany({
  where: {
    OR: [
      { project: { name: { contains: String(stamp) } } },
      { createdBy: { email: { endsWith: `+${stamp}@example.com` } } },
    ],
  },
});
await prisma.project.deleteMany({ where: { name: { contains: String(stamp) } } });
await prisma.user.deleteMany({ where: { email: { endsWith: `+${stamp}@example.com` } } });
await prisma.$disconnect();

console.log(failures === 0 ? "\nAll access-control checks passed." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);