import { createWriteStream } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createAccess } from "../auth/access.js";
import { assertSystem, creatorOf, type Actor } from "../auth/policy.js";
import { ForbiddenError, InvalidReferenceError, NotFoundError, UserError } from "../errors.js";
import type { MemberRepository } from "../repositories/memberRepository.js";
import type { TaskRepository } from "../repositories/repository.js";
import type { TaskPatch, TaskQuery } from "../schemas/task.schemas.js";
import type { NewTask, Role, Status, Task } from "../types.js";
import { buildMeta } from "./pagination.js";
import { isPastDate } from "./dates.js";

function validateDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) {
    throw new UserError("Due date must be a real date in YYYY-MM-DD format.");
  }
  return value;
}

function csvEscape(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

const isCreator = (task: Task, actor: Actor) =>
  actor.kind === "system" || task.createdById === actor.id;

type Deps = { tasks: TaskRepository; members: MemberRepository };

export function createTaskService({ tasks, members }: Deps) {
  const access = createAccess(members);

  // A task you may not see is reported exactly like one that does not exist
  async function loadTask(id: number, actor: Actor, minimum: Role = "member") {
    const task = await tasks.findById(id);
    if (!task) throw new NotFoundError(`No task with id ${id}.`);
    const role = await access.requireTaskRole(actor, task, minimum);
    return { task, role };
  }

  // A project you may not see is reported exactly like one that does not exist
  async function assertCanUseProject(actor: Actor, projectId: number) {
    if (!(await access.projectRole(actor, projectId))) {
      throw new UserError(`Project ${projectId} does not exist.`);
    }
  }

  // The foreign key still catches a project deleted a split second ago
  async function withProjectCheck<T>(projectId: number | undefined, op: () => Promise<T>) {
    try {
      return await op();
    } catch (err) {
      if (err instanceof InvalidReferenceError && projectId !== undefined) {
        throw new UserError(`Project ${projectId} does not exist.`);
      }
      throw err;
    }
  }

  async function getTask(id: number, actor: Actor): Promise<Task> {
    return (await loadTask(id, actor)).task;
  }

  async function addTask(input: NewTask, actor: Actor): Promise<Task> {
    const title = input.title.trim();
    if (!title) throw new UserError("Task title cannot be empty.");
    if (input.projectId !== undefined) await assertCanUseProject(actor, input.projectId);
    const dueDate = input.dueDate ? validateDate(input.dueDate) : undefined;
    if (dueDate && actor.kind === "user" && isPastDate(dueDate)) {
      throw new UserError("Due date cannot be in the past.");
    }

    return withProjectCheck(input.projectId, () =>
      tasks.insert({
        title,
        status: "todo",
        priority: input.priority ?? "medium",
        dueDate: dueDate,
        createdAt: new Date().toISOString(),
        projectId: input.projectId,
        createdById: creatorOf(actor),
      })
    );
  }

  async function queryTasks(q: TaskQuery, actor: Actor) {
    const scope = actor.kind === "user" ? { userId: actor.id } : undefined;
    const { items, total } = await tasks.query(q, scope);
    return { items, meta: buildMeta(total, q.page, q.limit) };
  }

  async function updateTask(id: number, patch: TaskPatch, actor: Actor): Promise<Task> {
    const { task, role } = await loadTask(id, actor, "member");

    // Moving a task between projects is a bigger decision than editing it
    const moving = patch.projectId !== undefined && (patch.projectId ?? undefined) !== task.projectId;
    if (moving) {
      if (role !== "owner" && !isCreator(task, actor)) {
        throw new ForbiddenError("Only the task's creator or a project owner can move it.");
      }
      if (patch.projectId !== null && patch.projectId !== undefined) {
        await assertCanUseProject(actor, patch.projectId);
      }
    }

    const changes: Partial<Omit<Task, "id">> = {};
    if (patch.title !== undefined) changes.title = patch.title;
    if (patch.status !== undefined) changes.status = patch.status;
    if (patch.priority !== undefined) changes.priority = patch.priority;
    if (patch.dueDate !== undefined) changes.dueDate = patch.dueDate ?? undefined;
    if (patch.projectId !== undefined) changes.projectId = patch.projectId ?? undefined;

    const updated = await withProjectCheck(patch.projectId ?? undefined, () =>
      tasks.update(id, changes)
    );
    if (!updated) throw new NotFoundError(`No task with id ${id}.`);
    return updated;
  }

  async function setStatus(id: number, status: Status, actor: Actor): Promise<Task> {
    return updateTask(id, { status }, actor);
  }

  async function deleteTask(id: number, actor: Actor): Promise<Task> {
    const { task, role } = await loadTask(id, actor, "member");
    if (role !== "owner" && !isCreator(task, actor)) {
      throw new ForbiddenError("Only the task's creator or a project owner can delete it.");
    }
    const removed = await tasks.remove(id);
    if (!removed) throw new NotFoundError(`No task with id ${id}.`);
    return removed;
  }

  // ---- CLI-only operations: they see everything, so the API must never call them ----

  async function listTasks(filter: { status?: Status } = {}, actor: Actor): Promise<Task[]> {
    assertSystem(actor);
    const all = await tasks.findAll();
    return filter.status ? all.filter((t) => t.status === filter.status) : all;
  }

  async function listOverdue(
    actor: Actor,
    today: string = new Date().toISOString().slice(0, 10)
  ): Promise<Task[]> {
    assertSystem(actor);
    return tasks.findOverdue(today);
  }

  async function summary(actor: Actor): Promise<Record<Status, number>> {
    assertSystem(actor);
    return tasks.countByStatus();
  }

  async function exportCsv(outFile: string, actor: Actor): Promise<string> {
    assertSystem(actor);
    if (path.extname(outFile) !== ".csv") throw new UserError("Export file must end with .csv");
    const target = path.resolve(outFile);
    const all = await tasks.findAll();

    await pipeline(
      Readable.from(all),
      async function* (source: AsyncIterable<Task>) {
        yield "id,title,status,priority,dueDate,createdAt\n";
        for await (const t of source) {
          yield `${t.id},${csvEscape(t.title)},${t.status},${t.priority},${t.dueDate ?? ""},${t.createdAt}\n`;
        }
      },
      createWriteStream(target)
    );
    return target;
  }

  return {
    getTask, addTask, queryTasks, updateTask, setStatus, deleteTask,
    listTasks, listOverdue, summary, exportCsv,
  };
}

export type TaskService = ReturnType<typeof createTaskService>;