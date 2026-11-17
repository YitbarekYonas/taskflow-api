import { beforeEach, describe, expect, it, vi } from "vitest";
import { jobs } from "../../src/container.js";
import { prisma } from "../../src/db.js";
import { asUser } from "../support/auth.js";
import { createProject, createTask, createUser } from "../support/factories.js";
import { outbox } from "../support/mail.js";
import { team } from "../support/scenarios.js";

beforeEach(() => {
  outbox().clear();
});

describe("assigning a task", () => {
  it("emails the assignee, naming the assigner, the task and the project", async () => {
    const { owner, member, project } = await team();
    const task = await createTask({ project, createdBy: owner, title: "Write the report" });

    const res = await (await asUser(owner)).patch(`/tasks/${task.id}`, { assigneeId: member.id });

    expect(res.status).toBe(200);
    expect(res.body.data.assigneeId).toBe(member.id);
    expect(outbox().sent).toHaveLength(1);
    const [mail] = outbox().sent;
    expect(mail.to).toBe(member.email);
    expect(mail.subject).toBe("Olga assigned you: Write the report");
    expect(mail.text).toContain("Alpha");
  });

  it("emails on creation too", async () => {
    const { owner, member, project } = await team();

    const res = await (
      await asUser(owner)
    ).post("/tasks", { title: "New work", projectId: project.id, assigneeId: member.id });

    expect(res.status).toBe(201);
    expect(res.body.data.assigneeId).toBe(member.id);
    expect(outbox().sent.map((m) => m.to)).toEqual([member.email]);
  });

  it("does not email someone who assigns a task to themselves", async () => {
    const { member, project } = await team();
    const task = await createTask({ project, createdBy: member });

    const res = await (await asUser(member)).patch(`/tasks/${task.id}`, { assigneeId: member.id });

    expect(res.status).toBe(200);
    expect(outbox().sent).toHaveLength(0);
  });

  it("emails only the new assignee when a task is reassigned, and nobody when it is unassigned", async () => {
    const { owner, member, project } = await team();
    const other = await createUser({ name: "Nina" });
    await prisma.projectMember.create({ data: { projectId: project.id, userId: other.id } });
    const task = await createTask({ project, createdBy: owner });
    const user = await asUser(owner);

    await user.patch(`/tasks/${task.id}`, { assigneeId: member.id });
    await user.patch(`/tasks/${task.id}`, { assigneeId: other.id });
    const unassigned = await user.patch(`/tasks/${task.id}`, { assigneeId: null });

    expect(outbox().sent.map((m) => m.to)).toEqual([member.email, other.email]);
    expect(unassigned.body.data.assigneeId).toBeUndefined();
  });

  it("sends nothing when an update leaves the assignee unchanged", async () => {
    const { owner, member, project } = await team();
    const task = await createTask({ project, createdBy: owner });
    const user = await asUser(owner);
    await user.patch(`/tasks/${task.id}`, { assigneeId: member.id });
    outbox().clear();

    await user.patch(`/tasks/${task.id}`, { assigneeId: member.id }); // the same again
    await user.patch(`/tasks/${task.id}`, { title: "Renamed" }); // an unrelated edit

    expect(outbox().sent).toHaveLength(0);
  });

  it("reads the title at send time, not at enqueue time", async () => {
    // Inline mode runs the job immediately, so this pins the contract the worker relies on:
    // the message is built from the stored task, never from data carried in the job
    const { owner, member, project } = await team();
    const task = await createTask({ project, createdBy: owner, title: "Stored title" });

    await (
      await asUser(owner)
    ).patch(`/tasks/${task.id}`, { assigneeId: member.id, title: "Edited title" });

    expect(outbox().sent[0].subject).toContain("Edited title");
  });
});

describe("who can be assigned", () => {
  it("refuses a user who is not a member of the project, answering exactly as for a user who does not exist", async () => {
    const { owner, stranger, project } = await team();
    const task = await createTask({ project, createdBy: owner });
    const user = await asUser(owner);

    const outsider = await user.patch(`/tasks/${task.id}`, { assigneeId: stranger.id });
    const missing = await user.patch(`/tasks/${task.id}`, { assigneeId: 999_999 });

    expect(outsider.status).toBe(400);
    expect(missing.status).toBe(400);
    expect(outsider.body.error.message.replace(/\d+/, "N")).toBe(
      missing.body.error.message.replace(/\d+/, "N"),
    );
    expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).assigneeId).toBeNull();
    expect(outbox().sent).toHaveLength(0);
  });

  it("refuses to assign a task that belongs to no project", async () => {
    const { owner, member } = await team();
    const personal = await createTask({ createdBy: owner });

    const res = await (
      await asUser(owner)
    ).patch(`/tasks/${personal.id}`, { assigneeId: member.id });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain("project");
  });

  it("refuses a bad assignee on creation, and stores nothing", async () => {
    const { owner, stranger, project } = await team();

    const res = await (
      await asUser(owner)
    ).post("/tasks", { title: "x", projectId: project.id, assigneeId: stranger.id });

    expect(res.status).toBe(400);
    expect(await prisma.task.count()).toBe(0);
  });

  it.each([
    ["a string", "abc"],
    ["zero", 0],
    ["a huge id", 99999999999],
    ["a negative id", -1],
  ])("rejects %s as an assignee with 400", async (_name, assigneeId) => {
    const { owner, project } = await team();
    const task = await createTask({ project, createdBy: owner });
    expect((await (await asUser(owner)).patch(`/tasks/${task.id}`, { assigneeId })).status).toBe(
      400,
    );
  });
});

describe("assignments follow membership", () => {
  it("clears the assignee when a task moves to a project they do not belong to, and keeps it when they do", async () => {
    const { owner, member, project } = await team();
    const elsewhere = await createProject({ owner }); // member is NOT in this one
    const shared = await createProject({ owner, members: [{ user: member }] });
    const leaves = await createTask({ project, createdBy: owner });
    const stays = await createTask({ project, createdBy: owner });
    const user = await asUser(owner);
    await user.patch(`/tasks/${leaves.id}`, { assigneeId: member.id });
    await user.patch(`/tasks/${stays.id}`, { assigneeId: member.id });

    const movedAway = await user.patch(`/tasks/${leaves.id}`, { projectId: elsewhere.id });
    const movedAcross = await user.patch(`/tasks/${stays.id}`, { projectId: shared.id });

    expect(movedAway.body.data.assigneeId).toBeUndefined();
    expect(movedAcross.body.data.assigneeId).toBe(member.id);
  });

  it("unassigns a member's tasks in that project, and only there, when they are removed or leave", async () => {
    const { owner, member, project } = await team();
    const other = await createProject({ owner, members: [{ user: member }] });
    const here = await createTask({ project, createdBy: owner });
    const there = await createTask({ project: other, createdBy: owner });
    const user = await asUser(owner);
    await user.patch(`/tasks/${here.id}`, { assigneeId: member.id });
    await user.patch(`/tasks/${there.id}`, { assigneeId: member.id });

    expect(
      (await (await asUser(member)).delete(`/projects/${project.id}/members/${member.id}`)).status,
    ).toBe(204);

    expect((await prisma.task.findUniqueOrThrow({ where: { id: here.id } })).assigneeId).toBeNull();
    expect((await prisma.task.findUniqueOrThrow({ where: { id: there.id } })).assigneeId).toBe(
      member.id,
    );
  });
});

describe("a notification problem never breaks the request", () => {
  it("still saves the assignment when the job cannot be queued", async () => {
    const { owner, member, project } = await team();
    const task = await createTask({ project, createdBy: owner });
    vi.spyOn(jobs, "enqueue").mockRejectedValue(new Error("redis down"));

    const res = await (await asUser(owner)).patch(`/tasks/${task.id}`, { assigneeId: member.id });

    expect(res.status).toBe(200);
    expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).assigneeId).toBe(
      member.id,
    );
  });

  it("still saves the assignment when the mail cannot be sent", async () => {
    const { owner, member, project } = await team();
    const task = await createTask({ project, createdBy: owner });
    outbox().failWith = () => new Error("smtp down");

    const res = await (await asUser(owner)).patch(`/tasks/${task.id}`, { assigneeId: member.id });

    expect(res.status).toBe(200);
    expect(outbox().sent).toHaveLength(0);
  });
});

describe("what a user typed cannot reach the mail headers", () => {
  it("flattens newlines in a title", async () => {
    const { owner, member, project } = await team();
    const task = await createTask({
      project,
      createdBy: owner,
      title: "Report\r\nBcc: evil@example.com",
    });

    await (await asUser(owner)).patch(`/tasks/${task.id}`, { assigneeId: member.id });

    const [mail] = outbox().sent;
    expect(mail.subject).not.toMatch(/[\r\n]/);
    expect(mail.text).not.toMatch(/\nBcc:/);
    expect(mail.to).toBe(member.email); // the recipient is the assignee, whatever the title says
  });
});
