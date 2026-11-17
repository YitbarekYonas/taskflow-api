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
    data: {
      taskId: opts.task.id,
      author: opts.by.name,
      authorId: opts.by.id,
      body: opts.body ?? "A comment",
    },
  });
}

// The team plus: a task from the owner, a task from the member, a personal task of the owner,
// and one comment from each on the owner's task
export async function workspace() {
  const t = await team();
  const ownersTask = await createTask({
    title: "owner's task",
    project: t.project,
    createdBy: t.owner,
  });
  const membersTask = await createTask({
    title: "member's task",
    project: t.project,
    createdBy: t.member,
  });
  const personalTask = await createTask({ title: "owner personal", createdBy: t.owner });
  const ownersComment = await createComment({
    task: ownersTask,
    by: t.owner,
    body: "owner comment",
  });
  const membersComment = await createComment({
    task: ownersTask,
    by: t.member,
    body: "member comment",
  });
  const newcomer = await createUser({ name: "Nina" });
  return { ...t, ownersTask, membersTask, personalTask, ownersComment, membersComment, newcomer };
}

const day = (offset: number) =>
  new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
export { day };

// Five tasks with known numbers. Dates are relative to now, so the data never goes stale.
export async function statsDataset() {
  const t = await team();
  const base = { project: t.project, createdBy: t.owner };
  const overdueTodo = await createTask({
    ...base,
    title: "overdue todo",
    status: "todo",
    priority: "high",
    dueDate: day(-1),
  });
  const soon = await createTask({
    ...base,
    title: "due soon",
    status: "in_progress",
    priority: "medium",
    dueDate: day(2),
  });
  const doneLate = await createTask({
    ...base,
    title: "done late",
    status: "done",
    priority: "low",
    dueDate: day(-1),
  });
  await createTask({
    ...base,
    title: "far away",
    status: "todo",
    priority: "medium",
    dueDate: day(30),
  });
  await createTask({ ...base, title: "no date", status: "todo", priority: "low" });
  return { ...t, overdueTodo, soon, doneLate };
}

export const BASELINE_STATS = {
  total: 5,
  byStatus: { todo: 3, in_progress: 1, done: 1 },
  byPriority: { low: 2, medium: 2, high: 1 },
  overdue: 1,
  dueSoon: 1,
};
