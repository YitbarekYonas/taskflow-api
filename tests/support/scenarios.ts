import { prisma } from "../../src/db.js";
import { createProject, createTask, createUser } from "./factories.js";

// The standard cast: an owner, a plain member and a stranger, plus one project
export async function team() {
  const owner = await createUser({ name: "Olga" });
  const member = await createUser({ name: "Max" });
  const stranger = await createUser({ name: "Sid" });
  const project = await createProject({ owner, members: [{ user: member }], name: "Alpha" });
  return { owner, member, stranger, project };
}

export async function createComment(opts: {
  task: { id: number };
  by: { id: number; name: string };
  body?: string;
}) {
  return prisma.comment.create({
    data: { taskId: opts.task.id, author: opts.by.name, authorId: opts.by.id, body: opts.body ?? "A comment" },
  });
}

// The team plus: a task from the owner, a task from the member, a personal task of the owner,
// and one comment from each on the owner's task
export async function workspace() {
  const t = await team();
  const ownersTask = await createTask({ title: "owner's task", project: t.project, createdBy: t.owner });
  const membersTask = await createTask({ title: "member's task", project: t.project, createdBy: t.member });
  const personalTask = await createTask({ title: "owner personal", createdBy: t.owner });
  const ownersComment = await createComment({ task: ownersTask, by: t.owner, body: "owner comment" });
  const membersComment = await createComment({ task: ownersTask, by: t.member, body: "member comment" });
  const newcomer = await createUser({ name: "Nina" });
  return { ...t, ownersTask, membersTask, personalTask, ownersComment, membersComment, newcomer };
}