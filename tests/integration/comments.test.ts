import { describe, expect, it } from "vitest";
import { prisma } from "../../src/db.js";
import { api } from "../support/app.js";
import { asUser } from "../support/auth.js";
import { createTask } from "../support/factories.js";
import { workspace } from "../support/scenarios.js";

describe("comments require authentication", () => {
  it.each([
    ["get", "/tasks/1/comments"],
    ["post", "/tasks/1/comments"],
    ["get", "/tasks/1/comments/1"],
    ["patch", "/tasks/1/comments/1"],
    ["delete", "/tasks/1/comments/1"],
  ] as const)("%s %s without a token -> 401", async (method, url) => {
    expect((await api()[method](url)).status).toBe(401);
  });
});

describe("POST /tasks/:taskId/comments", () => {
  it("takes the author from the token, trims the text and sets a Location header", async () => {
    const { member, ownersTask } = await workspace();

    const res = await (
      await asUser(member)
    ).post(`/tasks/${ownersTask.id}/comments`, { body: "  Looks good  " });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      taskId: ownersTask.id,
      author: "Max",
      authorId: member.id,
      body: "Looks good",
    });
    expect(res.headers.location).toBe(`/tasks/${ownersTask.id}/comments/${res.body.data.id}`);
  });

  it.each([
    ["an author in the body", { body: "x", author: "Olga" }],
    ["an authorId in the body", { body: "x", authorId: 1 }],
    ["a taskId in the body", { body: "x", taskId: 2 }],
    ["an empty text", { body: "   " }],
    ["a text over 2000 characters", { body: "x".repeat(2001) }],
    ["a NUL character", { body: "a\u0000b" }],
  ])("rejects %s with 400 and stores nothing new", async (_name, body) => {
    const { member, ownersTask } = await workspace();
    const before = await prisma.comment.count();

    expect(
      (await (await asUser(member)).post(`/tasks/${ownersTask.id}/comments`, body)).status,
    ).toBe(400);
    expect(await prisma.comment.count()).toBe(before);
  });

  it("lets the owner comment on a personal task, which nobody else can see", async () => {
    const { owner, member, stranger, personalTask } = await workspace();

    expect(
      (await (await asUser(owner)).post(`/tasks/${personalTask.id}/comments`, { body: "note" }))
        .status,
    ).toBe(201);
    expect(
      (await (await asUser(member)).post(`/tasks/${personalTask.id}/comments`, { body: "note" }))
        .status,
    ).toBe(404);
    expect(
      (await (await asUser(stranger)).post(`/tasks/${personalTask.id}/comments`, { body: "note" }))
        .status,
    ).toBe(404);
  });
});

describe("GET comments", () => {
  it("lists only the comments of that task, oldest first", async () => {
    const { owner, ownersComment, membersComment, membersTask } = await workspace();
    await createTask(); // an unrelated task, to make sure nothing leaks across tasks

    const res = await (await asUser(owner)).get(`/tasks/${ownersComment.taskId}/comments`);

    expect(res.status).toBe(200);
    expect(res.body.data.map((c: any) => c.id)).toEqual([ownersComment.id, membersComment.id]);
    expect(
      (await (await asUser(owner)).get(`/tasks/${membersTask.id}/comments`)).body.data,
    ).toEqual([]);
  });

  it("answers 404 when the comment belongs to a different task than the URL says", async () => {
    const { owner, ownersComment, membersTask } = await workspace();
    const user = await asUser(owner);

    expect((await user.get(`/tasks/${membersTask.id}/comments/${ownersComment.id}`)).status).toBe(
      404,
    );
    expect((await user.get(`/tasks/${ownersComment.taskId}/comments/999999`)).status).toBe(404);
    expect(
      (await user.get(`/tasks/${ownersComment.taskId}/comments/${ownersComment.id}`)).status,
    ).toBe(200);
  });
});

describe("PATCH comment", () => {
  it("lets the author edit it and records when", async () => {
    const { member, membersComment } = await workspace();

    const res = await (
      await asUser(member)
    ).patch(`/tasks/${membersComment.taskId}/comments/${membersComment.id}`, { body: "edited" });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ body: "edited", author: "Max" });
    expect(res.body.data.updatedAt).toEqual(expect.any(String));
  });

  it("does not let even a project owner edit someone else's words", async () => {
    const { owner, membersComment } = await workspace();

    const res = await (
      await asUser(owner)
    ).patch(`/tasks/${membersComment.taskId}/comments/${membersComment.id}`, { body: "forged" });

    expect(res.status).toBe(403);
    expect(
      (await prisma.comment.findUniqueOrThrow({ where: { id: membersComment.id } })).body,
    ).toBe("member comment");
  });

  it.each([
    ["an author change", { author: "Hacker" }],
    ["an empty body", {}],
  ])("rejects %s with 400", async (_n, body) => {
    const { member, membersComment } = await workspace();
    expect(
      (
        await (
          await asUser(member)
        ).patch(`/tasks/${membersComment.taskId}/comments/${membersComment.id}`, body)
      ).status,
    ).toBe(400);
  });
});

describe("DELETE comment", () => {
  it("lets the author delete their own comment", async () => {
    const { member, membersComment } = await workspace();
    expect(
      (
        await (
          await asUser(member)
        ).delete(`/tasks/${membersComment.taskId}/comments/${membersComment.id}`)
      ).status,
    ).toBe(204);
    expect(await prisma.comment.count({ where: { id: membersComment.id } })).toBe(0);
  });

  it("lets a project owner moderate by deleting any comment", async () => {
    const { owner, membersComment } = await workspace();
    expect(
      (
        await (
          await asUser(owner)
        ).delete(`/tasks/${membersComment.taskId}/comments/${membersComment.id}`)
      ).status,
    ).toBe(204);
  });

  it("forbids a member from deleting someone else's comment", async () => {
    const { member, ownersComment } = await workspace();
    expect(
      (
        await (
          await asUser(member)
        ).delete(`/tasks/${ownersComment.taskId}/comments/${ownersComment.id}`)
      ).status,
    ).toBe(403);
    expect(await prisma.comment.count({ where: { id: ownersComment.id } })).toBe(1);
  });
});

describe("comments of a deleted account", () => {
  it("keep the name that was shown, lose the link, and can only be moderated", async () => {
    const { owner, member, membersComment } = await workspace();
    await prisma.user.delete({ where: { id: member.id } });
    const user = await asUser(owner);
    const url = `/tasks/${membersComment.taskId}/comments/${membersComment.id}`;

    const shown = await user.get(url);
    expect(shown.body.data.author).toBe("Max");
    expect(shown.body.data.authorId).toBeUndefined();
    expect((await user.patch(url, { body: "rewritten" })).status).toBe(403); // nobody is the author any more
    expect((await user.delete(url)).status).toBe(204); // but the owner can still remove it
  });
});
