import { describe, expect, it } from "vitest";
import { prisma } from "../../src/db.js";
import { asUser } from "../support/auth.js";
import { createProject, createTask, createUser } from "../support/factories.js";
import { team } from "../support/scenarios.js";

const roleOf = async (projectId: number, userId: number) =>
  (await prisma.projectMember.findUnique({ where: { projectId_userId: { projectId, userId } } }))
    ?.role;

describe("GET /projects/:id/members", () => {
  it("lists members with their names and roles", async () => {
    const { owner, member, project } = await team();

    const res = await (await asUser(member)).get(`/projects/${project.id}/members`);

    expect(res.status).toBe(200);
    expect(res.body.data.map((m: any) => [m.userId, m.name, m.role])).toEqual([
      [owner.id, "Olga", "owner"],
      [member.id, "Max", "member"],
    ]);
    expect(res.body.data[0].joinedAt).toEqual(expect.any(String));
  });
});

describe("POST /projects/:id/members", () => {
  it("adds a user by email, ignoring case and spaces, and the new member gets access at once", async () => {
    const { owner, stranger, project } = await team();

    const res = await (
      await asUser(owner)
    ).post(`/projects/${project.id}/members`, {
      email: `  ${stranger.email.toUpperCase()} `,
    });

    expect(res.status).toBe(201);
    expect(res.body.data).toEqual({ userId: stranger.id, name: "Sid", role: "member" });
    expect(await roleOf(project.id, stranger.id)).toBe("member");
    expect((await (await asUser(stranger)).get(`/projects/${project.id}`)).status).toBe(200);
  });

  it("can add an owner, who can then manage the project", async () => {
    const { owner, stranger, project } = await team();

    await (
      await asUser(owner)
    ).post(`/projects/${project.id}/members`, { email: stranger.email, role: "owner" });

    expect(await roleOf(project.id, stranger.id)).toBe("owner");
    expect(
      (await (await asUser(stranger)).patch(`/projects/${project.id}`, { name: "Renamed" })).status,
    ).toBe(200);
  });

  it("answers 404 for an email nobody registered", async () => {
    const { owner, project } = await team();

    const res = await (
      await asUser(owner)
    ).post(`/projects/${project.id}/members`, { email: "nobody@example.com" });

    expect(res.status).toBe(404);
    expect(res.body.error.message).toBe("No user with that email.");
  });

  it("answers 409 for an existing member and does not change their role", async () => {
    const { owner, member, project } = await team();

    const res = await (
      await asUser(owner)
    ).post(`/projects/${project.id}/members`, { email: member.email, role: "owner" });

    expect(res.status).toBe(409);
    expect(await roleOf(project.id, member.id)).toBe("member");
  });

  it.each([
    ["an invalid email", { email: "nope" }],
    ["an unknown role", { email: "a@example.com", role: "admin" }],
    ["an extra field", { email: "a@example.com", userId: 1 }],
    ["an empty body", {}],
  ])("rejects %s with 400", async (_name, body) => {
    const { owner, project } = await team();
    expect((await (await asUser(owner)).post(`/projects/${project.id}/members`, body)).status).toBe(
      400,
    );
  });
});

describe("PATCH /projects/:id/members/:userId", () => {
  it("lets an owner promote a member", async () => {
    const { owner, member, project } = await team();

    const res = await (
      await asUser(owner)
    ).patch(`/projects/${project.id}/members/${member.id}`, { role: "owner" });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ userId: member.id, role: "owner" });
    expect(await roleOf(project.id, member.id)).toBe("owner");
  });

  it("answers 404 for a user who is not a member, and 400 for an impossible id or role", async () => {
    const { owner, stranger, project } = await team();
    const user = await asUser(owner);

    expect(
      (await user.patch(`/projects/${project.id}/members/${stranger.id}`, { role: "owner" }))
        .status,
    ).toBe(404);
    expect(
      (await user.patch(`/projects/${project.id}/members/99999999999`, { role: "owner" })).status,
    ).toBe(400);
    expect(
      (await user.patch(`/projects/${project.id}/members/${owner.id}`, { role: "admin" })).status,
    ).toBe(400);
  });

  it("refuses to demote the last owner, and the role stays", async () => {
    const { owner, project } = await team();

    const res = await (
      await asUser(owner)
    ).patch(`/projects/${project.id}/members/${owner.id}`, { role: "member" });

    expect(res.status).toBe(409);
    expect(res.body.error.message).toContain("at least one owner");
    expect(await roleOf(project.id, owner.id)).toBe("owner");
  });

  it("allows demoting an owner once another owner exists, and the demoted user loses owner rights", async () => {
    const { owner, member, project } = await team();
    await (
      await asUser(owner)
    ).patch(`/projects/${project.id}/members/${member.id}`, { role: "owner" });

    expect(
      (
        await (
          await asUser(owner)
        ).patch(`/projects/${project.id}/members/${owner.id}`, { role: "member" })
      ).status,
    ).toBe(200);
    expect(
      (await (await asUser(owner)).patch(`/projects/${project.id}`, { name: "Nope" })).status,
    ).toBe(403);
  });
});

describe("DELETE /projects/:id/members/:userId", () => {
  it("lets an owner remove a member, who loses access immediately but leaves their work behind", async () => {
    const { owner, member, project } = await team();
    const task = await createTask({ project, createdBy: member });
    const removed = await asUser(member); // the token stays valid: roles are looked up on every request

    expect(
      (await (await asUser(owner)).delete(`/projects/${project.id}/members/${member.id}`)).status,
    ).toBe(204);

    expect((await removed.get(`/projects/${project.id}`)).status).toBe(404);
    expect((await removed.get(`/tasks/${task.id}`)).status).toBe(404);
    expect(await prisma.task.count({ where: { id: task.id } })).toBe(1);
  });

  it("lets a member leave on their own", async () => {
    const { member, project } = await team();

    expect(
      (await (await asUser(member)).delete(`/projects/${project.id}/members/${member.id}`)).status,
    ).toBe(204);
    expect(await roleOf(project.id, member.id)).toBeUndefined();
  });

  it("stops the last owner from leaving, but lets one of two owners go", async () => {
    const { owner, member, project } = await team();
    const user = await asUser(owner);

    expect((await user.delete(`/projects/${project.id}/members/${owner.id}`)).status).toBe(409);

    await user.patch(`/projects/${project.id}/members/${member.id}`, { role: "owner" });
    expect((await user.delete(`/projects/${project.id}/members/${owner.id}`)).status).toBe(204);
  });

  it("answers 404 for a user who is not a member", async () => {
    const { owner, stranger, project } = await team();
    expect(
      (await (await asUser(owner)).delete(`/projects/${project.id}/members/${stranger.id}`)).status,
    ).toBe(404);
  });
});

describe("the last-owner rule under concurrency", () => {
  it("never leaves a project without an owner when two owners demote each other at the same moment", async () => {
    const a = await createUser();
    const b = await createUser();
    const clientA = await asUser(a);
    const clientB = await asUser(b);
    let bothSucceeded = 0;
    let withoutOwner = 0;

    for (let round = 0; round < 10; round++) {
      const project = await createProject({ owner: a, members: [{ user: b, role: "owner" }] });

      const [first, second] = await Promise.all([
        clientA.patch(`/projects/${project.id}/members/${b.id}`, { role: "member" }),
        clientB.patch(`/projects/${project.id}/members/${a.id}`, { role: "member" }),
      ]);

      if (first.status === 200 && second.status === 200) bothSucceeded++;
      if (
        (await prisma.projectMember.count({ where: { projectId: project.id, role: "owner" } })) ===
        0
      )
        withoutOwner++;
    }

    expect(withoutOwner).toBe(0);
    expect(bothSucceeded).toBe(0);
  });
});
