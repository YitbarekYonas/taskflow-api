import { describe, expect, it } from "vitest";
import { prisma } from "../../src/db.js";
import { asUser } from "../support/auth.js";
import { createProject } from "../support/factories.js";
import { workspace } from "../support/scenarios.js";

type Persona = "stranger" | "member" | "owner";
const PERSONAS: Persona[] = ["stranger", "member", "owner"];

async function scenario() {
  const s = await workspace();
  // Each persona owns one extra project, used as a merge target
  const targets = {
    stranger: await createProject({ owner: s.stranger, name: "Stranger's" }),
    member: await createProject({ owner: s.member, name: "Member's" }),
    owner: await createProject({ owner: s.owner, name: "Owner's" }),
  };
  return { ...s, targets };
}
type Scenario = Awaited<ReturnType<typeof scenario>>;
type Client = Awaited<ReturnType<typeof asUser>>;

type Action = {
  name: string;
  expected: [stranger: number, member: number, owner: number];
  call: (s: Scenario, who: Persona, as: Client) => Promise<{ status: number }>;
};

// Reading the table: "stranger / member / owner" get these status codes.
// 404 means "this does not exist as far as you are concerned", 403 means "you can see it, but may not".
const actions: Action[] = [
  { name: "read the project", expected: [404, 200, 200], call: (s, _w, as) => as.get(`/projects/${s.project.id}`) },
  { name: "list the project's tasks", expected: [404, 200, 200], call: (s, _w, as) => as.get(`/projects/${s.project.id}/tasks`) },
  { name: "list the members", expected: [404, 200, 200], call: (s, _w, as) => as.get(`/projects/${s.project.id}/members`) },
  { name: "rename the project", expected: [404, 403, 200], call: (s, _w, as) => as.patch(`/projects/${s.project.id}`, { name: "Renamed" }) },
  { name: "delete the project (it still has tasks)", expected: [404, 403, 409], call: (s, _w, as) => as.delete(`/projects/${s.project.id}`) },
  { name: "duplicate the project", expected: [404, 201, 201], call: (s, _w, as) => as.post(`/projects/${s.project.id}/duplicate`) },
  { name: "merge the project into one the caller owns", expected: [404, 403, 200], call: (s, w, as) => as.post(`/projects/${s.project.id}/merge`, { intoProjectId: s.targets[w].id }) },
  { name: "add a member", expected: [404, 403, 201], call: (s, _w, as) => as.post(`/projects/${s.project.id}/members`, { email: s.newcomer.email }) },
  { name: "promote oneself to owner", expected: [404, 403, 200], call: (s, w, as) => as.patch(`/projects/${s.project.id}/members/${s[w].id}`, { role: "owner" }) },
  { name: "remove the only owner", expected: [404, 403, 409], call: (s, _w, as) => as.delete(`/projects/${s.project.id}/members/${s.owner.id}`) },
  { name: "create a task in the project", expected: [400, 201, 201], call: (s, _w, as) => as.post("/tasks", { title: "New", projectId: s.project.id }) },
  { name: "read the owner's task", expected: [404, 200, 200], call: (s, _w, as) => as.get(`/tasks/${s.ownersTask.id}`) },
  { name: "edit the owner's task", expected: [404, 200, 200], call: (s, _w, as) => as.patch(`/tasks/${s.ownersTask.id}`, { status: "done" }) },
  { name: "move the owner's task out of the project", expected: [404, 403, 200], call: (s, _w, as) => as.patch(`/tasks/${s.ownersTask.id}`, { projectId: null }) },
  { name: "delete the owner's task", expected: [404, 403, 204], call: (s, _w, as) => as.delete(`/tasks/${s.ownersTask.id}`) },
  { name: "delete the member's task", expected: [404, 204, 204], call: (s, _w, as) => as.delete(`/tasks/${s.membersTask.id}`) },
  { name: "read the owner's personal task", expected: [404, 404, 200], call: (s, _w, as) => as.get(`/tasks/${s.personalTask.id}`) },
  { name: "edit the owner's personal task", expected: [404, 404, 200], call: (s, _w, as) => as.patch(`/tasks/${s.personalTask.id}`, { title: "Changed" }) },
  { name: "list comments on the owner's task", expected: [404, 200, 200], call: (s, _w, as) => as.get(`/tasks/${s.ownersTask.id}/comments`) },
  { name: "add a comment", expected: [404, 201, 201], call: (s, _w, as) => as.post(`/tasks/${s.ownersTask.id}/comments`, { body: "Hello" }) },
  { name: "edit the owner's comment", expected: [404, 403, 200], call: (s, _w, as) => as.patch(`/tasks/${s.ownersTask.id}/comments/${s.ownersComment.id}`, { body: "Edited" }) },
  { name: "edit the member's comment", expected: [404, 200, 403], call: (s, _w, as) => as.patch(`/tasks/${s.ownersTask.id}/comments/${s.membersComment.id}`, { body: "Edited" }) },
  { name: "delete the owner's comment", expected: [404, 403, 204], call: (s, _w, as) => as.delete(`/tasks/${s.ownersTask.id}/comments/${s.ownersComment.id}`) },
  { name: "delete the member's comment", expected: [404, 204, 204], call: (s, _w, as) => as.delete(`/tasks/${s.ownersTask.id}/comments/${s.membersComment.id}`) },
];

// Every row of every table, as one string. A denied request must leave it untouched.
async function fingerprint() {
  return JSON.stringify({
    users: await prisma.user.findMany({ orderBy: { id: "asc" }, select: { id: true, email: true, name: true } }),
    projects: await prisma.project.findMany({ orderBy: { id: "asc" } }),
    members: await prisma.projectMember.findMany({ orderBy: [{ projectId: "asc" }, { userId: "asc" }] }),
    tasks: await prisma.task.findMany({ orderBy: { id: "asc" } }),
    comments: await prisma.comment.findMany({ orderBy: { id: "asc" } }),
  });
}

for (const action of actions) {
  describe(action.name, () => {
    for (const [index, persona] of PERSONAS.entries()) {
      const expected = action.expected[index];

      it(`${persona} -> ${expected}`, async () => {
        const s = await scenario();
        const as = await asUser(s[persona]);
        const before = await fingerprint();

        const res = await action.call(s, persona, as);

        expect(res.status).toBe(expected);
        if (expected >= 400) {
          expect(await fingerprint()).toBe(before); // a refused request changes nothing at all
        }
      });
    }
  });
}