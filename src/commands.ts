import { createWriteStream } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { load, save } from "./storage.js";
import { UserError } from "./errors.js";
import { findById } from "./utils.js";
import type { NewTask, Status, Task } from "./types.js";

function validateDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) {
    throw new UserError("Due date must be a real date in YYYY-MM-DD format.");
  }
  return value;
}

export async function addTask(input: NewTask): Promise<Task> {
  const title = input.title.trim();
  if (!title) throw new UserError("Task title cannot be empty.");

  const tasks = await load();
  const task: Task = {
    id: tasks.reduce((max, t) => Math.max(max, t.id), 0) + 1,
    title,
    status: "todo",
    priority: input.priority ?? "medium",
    dueDate: input.dueDate ? validateDate(input.dueDate) : undefined,
    createdAt: new Date().toISOString(),
  };
  tasks.push(task);
  await save(tasks);
  return task;
}

export async function listTasks(filter: { status?: Status } = {}): Promise<Task[]> {
  const tasks = await load();
  return filter.status ? tasks.filter((t) => t.status === filter.status) : tasks;
}

export async function setStatus(id: number, status: Status): Promise<Task> {
  const tasks = await load();
  const task = findById(tasks, id, "task");
  task.status = status;
  await save(tasks);
  return task;
}

export async function deleteTask(id: number): Promise<Task> {
  const tasks = await load();
  const task = findById(tasks, id, "task");
  await save(tasks.filter((t) => t.id !== id));
  return task;
}

function csvEscape(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

export async function exportCsv(outFile: string): Promise<string> {
  if (path.extname(outFile) !== ".csv") {
    throw new UserError("Export file must end with .csv");
  }
  const target = path.resolve(outFile);
  const tasks = await load();

  await pipeline(
    Readable.from(tasks),
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