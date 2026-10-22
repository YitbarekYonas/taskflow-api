import { createWriteStream } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { NotFoundError, UserError } from "../errors.js";
import type { Repository } from "../repositories/repository.js";
import type { TaskPatch, TaskQuery } from "../schemas/task.schemas.js";
import { applyQuery } from "./taskQuery.js";
import type { NewTask, Status, Task} from "../types.js";
import { InvalidReferenceError } from "../errors.js";

type Deps = { tasks: Repository<Task> };

  // The database rejects a bad projectId; we only add a friendly message
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
export function createTaskService({ tasks }: Deps){
  async function getTask(id: number): Promise<Task> {
    const task = await tasks.findById(id);
    if (!task) throw new NotFoundError(`No task with id ${id}.`);
    return task;
  }

  function validateDate(value: string): string {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) {
      throw new UserError("Due date must be a real date in YYYY-MM-DD format.");
    }
    return value;
  }

  function csvEscape(value: string): string {
    return `"${value.replaceAll('"', '""')}"`;
  }

  async function addTask(input: NewTask): Promise<Task> {
    const title = input.title.trim();
    if (!title) throw new UserError("Task title cannot be empty.");

    return withProjectCheck(input.projectId, () => tasks.insert({title,
      status: "todo",
      priority: input.priority ?? "medium",
      dueDate: input.dueDate ? validateDate(input.dueDate) : undefined,
      createdAt: new Date().toISOString(),
      projectId: input.projectId,}));

  }

  async function listTasks(filter: { status?: Status } = {}): Promise<Task[]> {
    const all = await tasks.findAll();
    return filter.status ? all.filter((t) => t.status === filter.status) : all;
  }

  async function queryTasks(q: TaskQuery) {
    return applyQuery(await tasks.findAll(), q);
  }

  async function updateTask(id: number, patch: TaskPatch): Promise<Task> {
    const changes: Partial<Omit<Task, "id">> = {};
    if (patch.title !== undefined) changes.title = patch.title;
    if (patch.status !== undefined) changes.status = patch.status;
    if (patch.priority !== undefined) changes.priority = patch.priority;
    if (patch.dueDate !== undefined) changes.dueDate = patch.dueDate ?? undefined;

    if (patch.projectId !== undefined) {
      if (patch.projectId !== undefined) changes.projectId = patch.projectId ?? undefined;
      changes.projectId = patch.projectId ?? undefined;
    }
    
    const updated = await withProjectCheck(patch.projectId ?? undefined, () => tasks.update(id, changes));
    if (!updated) throw new NotFoundError(`No task with id ${id}.`);
    return updated;
  }

  async function setStatus(id: number, status: Status): Promise<Task> {
    return updateTask(id, { status });
  }

  async function deleteTask(id: number): Promise<Task> {
    const removed = await tasks.remove(id);
    if (!removed) throw new NotFoundError(`No task with id ${id}.`);

    return removed;
  }

  async function listOverdue(
    today: string = new Date().toISOString().slice(0, 10)
  ): Promise<Task[]> {
    const all = await tasks.findAll();
    return all.filter(
      (t) => t.status !== "done" && t.dueDate !== undefined && t.dueDate < today
    );
  }

  async function summary(): Promise<Record<Status, number>> {
    const counts: Record<Status, number> = { todo: 0, in_progress: 0, done: 0 };
    for (const t of await tasks.findAll()) counts[t.status]++;
    return counts;
  }

  async function exportCsv(outFile: string): Promise<string> {
    if (path.extname(outFile) !== ".csv") {
      throw new UserError("Export file must end with .csv");
    }
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
    getTask, addTask, listTasks, queryTasks, updateTask,
    setStatus, deleteTask, listOverdue, summary, exportCsv,
  };
} 

export type TaskService = ReturnType<typeof createTaskService>;