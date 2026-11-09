import { describe, expect, it } from "vitest";
import { prisma } from "../../src/db.js";
import { api } from "../support/app.js";
import { asUser } from "../support/auth.js";
import { createProject, createTask, createUser } from "../support/factories.js";

async function team() {
  const owner = await createUser({ name: "Olga" });
  const member = await createUser({ name: "Max" });
  const stranger = await createUser({ name: "Sid" });
  const project = await createProject({ owner, members: [{ user: member }], name: "Alpha" });
  return { owner, member, stranger, project };
}

describe("projects require authentication", () => {
  it.each([
    ["get", "/projects"],
    ["post", "/projects"],
    ["get", "/projects/1"],
    ["patch", "/projects/1"],
    ["delete", "/projects/1"],
    ["post", "/projects/1/duplicate"],
    ["post", "/projects/1/merge"],
  ] as const)("%s %s without a token -> 401", async (method, url) => {
    expect((await api()[method](url)).status).toBe(401);
  });
});

describe("POST /projects", () => {
  it("creates the project, a slug and the creator's owner membership together", async () => {
    const olga = await createUser();
    const res = await (await asUser(olga)).post("/projects", { name: "My Project", description: "Backend" });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      name: "My Project", description: "Backend", createdById: olga.id,
      slug: expect.stringMatching(/^my-project-[0-9a-f]{6}$/),
    });
    expect(res.headers.location).toBe(`/projects/${res.body.data.id}`);

    const membership = await prisma.projectMember.findUniqueOrThrow({
      where: { projectId_userId: { projectId: res.body.data.id, userId: olga.id } },
    });
    expect(membership.role).toBe("owner");
  });

  it.each([
    ["an empty name", { name: "  " }],
    ["a client-chosen slug", { name: "x", slug: "mine" }],
    ["a client-chosen creator", { name: "x", createdById: 1 }],
    ["a NUL character in the name", { name: "a\u0000b" }],
  ])("rejects %s with 400 and stores nothing", async (_name, body) => {
    const olga = await createUser();
    const res = await (await asUser(olga)).post("/projects", body);

    expect(res.status).toBe(400);
    expect(await prisma.project.count()).toBe(0);
  });
});

describe("GET /projects and /projects/:id", () => {
  it("lists only your projects, each with its task count", async () => {
    const { owner, member, stranger, project } = await team();
    await createTask({ project, createdBy: owner });
    await createTask({ project, createdBy: member });
    await createProject({ owner: stranger, name: "Secret" });

    const res = await (await asUser(member)).get("/projects");

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([expect.objectContaining({ id: project.id, name: "Alpha", taskCount: 2 })]);
  });

  it("answers 404 for a stranger, exactly as for a missing project", async () => {
    const { stranger, project } = await team();
    const user = await asUser(stranger);

    const hidden = await user.get(`/projects/${project.id}`);
    const missing = await user.get("/projects/999999");

    expect(hidden.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(hidden.body.error.message.replace(/\d+/, "N")).toBe(missing.body.error.message.replace(/\d+/, "N"));
  });
});

describe("PATCH /projects/:id", () => {
  it("lets an owner rename it, and the slug stays the same", async () => {
    const { owner, project } = await team();
    const res = await (await asUser(owner)).patch(`/projects/${project.id}`, { name: "Renamed" });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ name: "Renamed", slug: project.slug });
  });

  it("answers 403 for a member and 404 for a stranger, changing nothing", async () => {
    const { member, stranger, project } = await team();

    expect((await (await asUser(member)).patch(`/projects/${project.id}`, { name: "Mine" })).status).toBe(403);
    expect((await (await asUser(stranger)).patch(`/projects/${project.id}`, { name: "Mine" })).status).toBe(404);
    expect((await prisma.project.findUniqueOrThrow({ where: { id: project.id } })).name).toBe("Alpha");
  });

  it.each([["an empty body", {}], ["a slug change", { slug: "hacked" }]])("rejects %s with 400", async (_n, body) => {
    const { owner, project } = await team();
    expect((await (await asUser(owner)).patch(`/projects/${project.id}`, body)).status).toBe(400);
  });
});

describe("DELETE /projects/:id", () => {
  it("is blocked with 409 while tasks exist, then allowed once they are gone", async () => {
    const { owner, project } = await team();
    const task = await createTask({ project, createdBy: owner });
    const user = await asUser(owner);

    const blocked = await user.delete(`/projects/${project.id}`);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.message).toContain("tasks");
    expect(await prisma.project.count()).toBe(1);

    await user.delete(`/tasks/${task.id}`);
    expect((await user.delete(`/projects/${project.id}`)).status).toBe(204);
    expect(await prisma.projectMember.count()).toBe(0); // memberships go with the project
  });

  it("answers 403 for a member and 404 for a stranger", async () => {
    const { member, stranger, project } = await team();

    expect((await (await asUser(member)).delete(`/projects/${project.id}`)).status).toBe(403);
    expect((await (await asUser(stranger)).delete(`/projects/${project.id}`)).status).toBe(404);
    expect(await prisma.project.count()).toBe(1);
  });
});

describe("POST /projects/:id/duplicate", () => {
  it("copies the project and its tasks, as fresh todo tasks owned by the caller", async () => {
    const { owner, member, project } = await team();
    await createTask({ title: "one", status: "done", priority: "high", dueDate: "2030-05-01", project, createdBy: owner });
    await createTask({ title: "two", status: "in_progress", project, createdBy: owner });

    const res = await (await asUser(member)).post(`/projects/${project.id}/duplicate`);

    expect(res.status).toBe(201);
    const copy = res.body.data.project;
    expect(res.body.data.copiedTasks).toBe(2);
    expect(res.headers.location).toBe(`/projects/${copy.id}`);
    expect(copy).toMatchObject({ name: "Alpha (copy)", createdById: member.id });
    expect(copy.slug).not.toBe(project.slug);

    const copied = await prisma.task.findMany({ where: { projectId: copy.id }, orderBy: { title: "asc" } });
    expect(copied.map((t) => [t.title, t.status, t.priority, t.createdById])).toEqual([
      ["one", "todo", "high", member.id],
      ["two", "todo", "medium", member.id],
    ]);
    expect(copied[0].dueDate?.toISOString().slice(0, 10)).toBe("2030-05-01");
    expect(await prisma.task.count({ where: { projectId: project.id } })).toBe(2); // original untouched

    const membership = await prisma.projectMember.findUniqueOrThrow({
      where: { projectId_userId: { projectId: copy.id, userId: member.id } },
    });
    expect(membership.role).toBe("owner");
  });

  it("accepts a custom name, and answers 404 for a stranger", async () => {
    const { owner, stranger, project } = await team();

    const named = await (await asUser(owner)).post(`/projects/${project.id}/duplicate`, { name: "Beta" });
    expect(named.body.data.project.name).toBe("Beta");

    expect((await (await asUser(stranger)).post(`/projects/${project.id}/duplicate`)).status).toBe(404);
    expect(await prisma.project.count()).toBe(2); // only the copy made by the owner
  });
});

describe("POST /projects/:id/merge", () => {
  it("moves every task into the target and removes the source", async () => {
    const { owner, project: source } = await team();
    const target = await createProject({ owner, name: "Target" });
    await createTask({ project: source, createdBy: owner });
    await createTask({ project: source, createdBy: owner });
    const user = await asUser(owner);

    const res = await user.post(`/projects/${source.id}/merge`, { intoProjectId: target.id });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ movedTasks: 2, project: { id: target.id } });
    expect((await user.get(`/projects/${source.id}`)).status).toBe(404);
    expect(await prisma.task.count({ where: { projectId: target.id } })).toBe(2);
    expect(await prisma.projectMember.count({ where: { projectId: source.id } })).toBe(0);
  });

  it("changes nothing when the caller does not own the target (all or nothing)", async () => {
    const { owner } = await team();
    const other = await createUser();
    const source = await createProject({ owner });
    const target = await createProject({ owner: other, members: [{ user: owner }] }); // owner is only a member here
    await createTask({ project: source, createdBy: owner });

    const res = await (await asUser(owner)).post(`/projects/${source.id}/merge`, { intoProjectId: target.id });

    expect(res.status).toBe(403);
    expect(await prisma.project.count({ where: { id: source.id } })).toBe(1);
    expect(await prisma.task.count({ where: { projectId: source.id } })).toBe(1);
    expect(await prisma.task.count({ where: { projectId: target.id } })).toBe(0);
  });

  it("treats an invisible target exactly like a missing one", async () => {
    const { owner, stranger } = await team();
    const source = await createProject({ owner });
    const hidden = await createProject({ owner: stranger });
    const user = await asUser(owner);

    const a = await user.post(`/projects/${source.id}/merge`, { intoProjectId: hidden.id });
    const b = await user.post(`/projects/${source.id}/merge`, { intoProjectId: 999_999 });

    expect(a.status).toBe(400);
    expect(b.status).toBe(400);
    expect(a.body.error.message.replace(/\d+/, "N")).toBe(b.body.error.message.replace(/\d+/, "N"));
  });

  it("rejects a self-merge, and answers 403 for a member and 404 for a stranger on the source", async () => {
    const { owner, member, stranger, project } = await team();
    const target = await createProject({ owner: member });

    expect((await (await asUser(owner)).post(`/projects/${project.id}/merge`, { intoProjectId: project.id })).status).toBe(400);
    expect((await (await asUser(member)).post(`/projects/${project.id}/merge`, { intoProjectId: target.id })).status).toBe(403);
    expect((await (await asUser(stranger)).post(`/projects/${project.id}/merge`, { intoProjectId: target.id })).status).toBe(404);
  });

  it("lets exactly one of two simultaneous merges win, with no task lost or duplicated", async () => {
    const { owner } = await team();
    const source = await createProject({ owner });
    const target = await createProject({ owner });
    for (let i = 0; i < 5; i++) await createTask({ project: source, createdBy: owner });
    const user = await asUser(owner);

    const results = await Promise.all([
      user.post(`/projects/${source.id}/merge`, { intoProjectId: target.id }),
      user.post(`/projects/${source.id}/merge`, { intoProjectId: target.id }),
    ]);

    const statuses = results.map((r) => r.status).sort();
    expect(statuses.filter((s) => s === 200)).toHaveLength(1);
    expect(statuses.filter((s) => s !== 200).every((s) => s === 404 || s === 409)).toBe(true);
    expect(await prisma.task.count({ where: { projectId: target.id } })).toBe(5);
  });
});