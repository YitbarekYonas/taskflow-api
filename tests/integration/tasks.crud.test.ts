import { describe, expect, it } from "vitest";
import { prisma } from "../../src/db.js";
import { api } from "../support/app.js";
import { asUser } from "../support/auth.js";
import { createProject, createTask} from "../support/factories.js";
import { team } from "../support/scenarios.js";
// The same cast in every test: an owner, a plain member and a stranger

describe("tasks require authentication", () => {
  it.each([
    ["get", "/tasks"],
    ["post", "/tasks"],
    ["get", "/tasks/1"],
    ["patch", "/tasks/1"],
    ["delete", "/tasks/1"],
  ] as const)("%s %s without a token -> 401", async (method, url) => {
    const res = await api()[method](url);
    expect(res.status).toBe(401);
    expect(res.headers["www-authenticate"]).toContain("Bearer");
  });
});

describe("POST /tasks", () => {
  it("creates a personal task with defaults and records the creator", async () => {
    const { member } = await team();
    const res = await (await asUser(member)).post("/tasks", { title: "  Write tests  " });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      title: "Write tests", // trimmed
      status: "todo",
      priority: "medium",
      createdById: member.id, // comes from the token
    });
    expect(res.headers.location).toBe(`/tasks/${res.body.data.id}`);

    const row = await prisma.task.findUniqueOrThrow({ where: { id: res.body.data.id } });
    expect(row.createdById).toBe(member.id);
    expect(row.projectId).toBeNull();
  });

  it("creates a task inside a project the caller belongs to", async () => {
    const { member, project } = await team();
    const res = await (
      await asUser(member)
    ).post("/tasks", {
      title: "Shared work",
      priority: "high",
      dueDate: "2030-01-31",
      projectId: project.id,
    });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      projectId: project.id,
      priority: "high",
      dueDate: "2030-01-31",
    });
  });

  it("answers 400, and stores nothing, for a project the caller cannot see", async () => {
    const { stranger, project } = await team();
    const user = await asUser(stranger);

    const hidden = await user.post("/tasks", { title: "x", projectId: project.id });
    const missing = await user.post("/tasks", { title: "x", projectId: 999_999 });

    expect(hidden.status).toBe(400);
    expect(hidden.body.error.message).toBe(`Project ${project.id} does not exist.`);
    // an existing-but-invisible project looks exactly like a missing one
    expect(missing.status).toBe(400);
    expect(missing.body.error.message).toBe("Project 999999 does not exist.");
    expect(await prisma.task.count()).toBe(0);
  });

  it.each([
    ["an empty title", { title: "   " }],
    ["a title over 200 characters", { title: "x".repeat(201) }],
    ["a client-chosen creator", { title: "x", createdById: 1 }],
    ["an unknown priority", { title: "x", priority: "urgent" }],
    ["an impossible due date", { title: "x", dueDate: "2030-13-45" }],
    ["a NUL character in the title", { title: "a\u0000b" }],
  ])("rejects %s with 400 and stores nothing", async (_name, body) => {
    const { member } = await team();
    const res = await (await asUser(member)).post("/tasks", body);

    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe("Validation failed");
    expect(await prisma.task.count()).toBe(0);
  });
});

describe("GET /tasks/:id", () => {
  it("shows a project task to a member and a personal task to its creator", async () => {
    const { member, project } = await team();
    const shared = await createTask({ project, createdBy: member });
    const personal = await createTask({ createdBy: member });
    const user = await asUser(member);

    expect((await user.get(`/tasks/${shared.id}`)).status).toBe(200);
    expect((await user.get(`/tasks/${personal.id}`)).body.data.id).toBe(personal.id);
  });

  it("answers 404 for a stranger, exactly as for a task that does not exist", async () => {
    const { owner, stranger, project } = await team();
    const hidden = await createTask({ project, createdBy: owner });
    const personal = await createTask({ createdBy: owner });
    const user = await asUser(stranger);

    const responses = await Promise.all([
      user.get(`/tasks/${hidden.id}`),
      user.get(`/tasks/${personal.id}`),
      user.get("/tasks/999999"),
    ]);

    for (const res of responses) {
      expect(res.status).toBe(404);
      expect(res.body).toEqual({
        error: { message: expect.stringMatching(/^No task with id \d+\.$/) },
      });
    }
  });

  it.each(["abc", "0", "-1", "99999999999999999999999"])(
    "answers 400 for the id %j",
    async (id) => {
      const { member } = await team();
      expect((await (await asUser(member)).get(`/tasks/${id}`)).status).toBe(400);
    },
  );
});

describe("PATCH /tasks/:id", () => {
  it("lets any member edit a teammate's task, changing only the sent fields", async () => {
    const { owner, member, project } = await team();
    const task = await createTask({
      project,
      createdBy: owner,
      title: "Original",
      priority: "high",
    });

    const res = await (await asUser(member)).patch(`/tasks/${task.id}`, { status: "in_progress" });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      id: task.id,
      status: "in_progress",
      title: "Original",
      priority: "high",
    });
    expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).status).toBe(
      "in_progress",
    );
  });

  it("clears a due date when null is sent", async () => {
    const { member } = await team();
    const task = await createTask({ createdBy: member, dueDate: "2030-01-01" });

    const res = await (await asUser(member)).patch(`/tasks/${task.id}`, { dueDate: null });

    expect(res.status).toBe(200);
    expect(res.body.data.dueDate).toBeUndefined();
    expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).dueDate).toBeNull();
  });

  it.each([
    ["an empty body", {}],
    ["an unknown field", { title: "x", createdById: 5 }],
    ["an unknown status", { status: "finished" }],
  ])("rejects %s with 400", async (_name, body) => {
    const { member } = await team();
    const task = await createTask({ createdBy: member });
    expect((await (await asUser(member)).patch(`/tasks/${task.id}`, body)).status).toBe(400);
  });

  it("answers 404, and changes nothing, for a stranger", async () => {
    const { owner, stranger, project } = await team();
    const task = await createTask({ project, createdBy: owner, title: "Mine" });

    const res = await (await asUser(stranger)).patch(`/tasks/${task.id}`, { title: "Hijacked" });

    expect(res.status).toBe(404);
    expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).title).toBe("Mine");
  });

  describe("moving a task between projects", () => {
    it("is forbidden for a member who did not create the task", async () => {
      const { owner, member, project } = await team();
      const task = await createTask({ project, createdBy: owner });

      const res = await (await asUser(member)).patch(`/tasks/${task.id}`, { projectId: null });

      expect(res.status).toBe(403);
      expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).projectId).toBe(
        project.id,
      );
    });

    it("is allowed for the task's creator, into another project they belong to", async () => {
      const { member, project } = await team();
      const other = await createProject({ owner: member });
      const task = await createTask({ project, createdBy: member });

      const res = await (await asUser(member)).patch(`/tasks/${task.id}`, { projectId: other.id });

      expect(res.status).toBe(200);
      expect(res.body.data.projectId).toBe(other.id);
    });

    it("is allowed for a project owner", async () => {
      const { owner, member, project } = await team();
      const task = await createTask({ project, createdBy: member });

      const res = await (await asUser(owner)).patch(`/tasks/${task.id}`, { projectId: null });

      expect(res.status).toBe(200);
      expect(res.body.data.projectId).toBeUndefined();
    });

    it("answers 400 when the target project is not visible to the caller", async () => {
      const { owner, member, stranger, project } = await team();
      const elsewhere = await createProject({ owner: stranger });
      const task = await createTask({ project, createdBy: member });

      const res = await (
        await asUser(member)
      ).patch(`/tasks/${task.id}`, { projectId: elsewhere.id });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toBe(`Project ${elsewhere.id} does not exist.`);
      expect(owner.id).toBeDefined();
    });
  });
});

describe("DELETE /tasks/:id", () => {
  it("lets a member delete their own task, and a second delete is a 404", async () => {
    const { member, project } = await team();
    const task = await createTask({ project, createdBy: member });
    const user = await asUser(member);

    expect((await user.delete(`/tasks/${task.id}`)).status).toBe(204);
    expect(await prisma.task.count()).toBe(0);
    expect((await user.delete(`/tasks/${task.id}`)).status).toBe(404);
  });

  it("forbids a member from deleting a teammate's task, and leaves it in place", async () => {
    const { owner, member, project } = await team();
    const task = await createTask({ project, createdBy: owner });

    const res = await (await asUser(member)).delete(`/tasks/${task.id}`);

    expect(res.status).toBe(403);
    expect(await prisma.task.count()).toBe(1);
  });

  it("lets a project owner delete anyone's task", async () => {
    const { owner, member, project } = await team();
    const task = await createTask({ project, createdBy: member });

    expect((await (await asUser(owner)).delete(`/tasks/${task.id}`)).status).toBe(204);
  });

  it("answers 404 for a stranger and leaves the task in place", async () => {
    const { owner, stranger, project } = await team();
    const task = await createTask({ project, createdBy: owner });

    expect((await (await asUser(stranger)).delete(`/tasks/${task.id}`)).status).toBe(404);
    expect(await prisma.task.count()).toBe(1);
  });

  it("deletes the task's comments with it (cascade)", async () => {
    const { owner, project } = await team();
    const task = await createTask({ project, createdBy: owner });
    await prisma.comment.create({
      data: { taskId: task.id, author: "Olga", authorId: owner.id, body: "hello" },
    });

    await (await asUser(owner)).delete(`/tasks/${task.id}`);

    expect(await prisma.comment.count()).toBe(0);
  });
});
describe("due dates on creation", () => {
  // Computed relative to now, so the tests never go stale
  const daysFromNow = (days: number) =>
    new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

  it("rejects a due date in the past with 400 and a clear message", async () => {
    const { member } = await team();
    const res = await (
      await asUser(member)
    ).post("/tasks", { title: "x", dueDate: daysFromNow(-3) });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe("Due date cannot be in the past.");
    expect(await prisma.task.count()).toBe(0);
  });

  it("accepts a future due date", async () => {
    const { member } = await team();
    const res = await (
      await asUser(member)
    ).post("/tasks", { title: "x", dueDate: daysFromNow(3) });

    expect(res.status).toBe(201);
  });

  it("still lets an update move the date into the past (documented decision)", async () => {
    const { member } = await team();
    const task = await createTask({ createdBy: member, dueDate: daysFromNow(10) });

    const res = await (
      await asUser(member)
    ).patch(`/tasks/${task.id}`, { dueDate: daysFromNow(-3) });

    expect(res.status).toBe(200);
  });
});
