import type { PrismaClient, Task as TaskRow } from "../../generated/prisma/client.js";
import type { Priority, Status, Task } from "../../types.js";
import type { Repository } from "../repository.js";
import { isPrismaError } from "./errors.js";
import { mapWriteError } from "./errors.js";

type TaskData = Omit<Task, "id">;

type TaskColumns = {
  title?: string;
  status?: Status;
  priority?: Priority;
  dueDate?: Date | null;
  createdAt?: Date;
  projectId?: number | null;
};

// Database row -> domain object
function toTask(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    priority: row.priority,
    dueDate: row.dueDate ? row.dueDate.toISOString().slice(0, 10) : undefined,
    createdAt: row.createdAt.toISOString(),
    projectId: row.projectId ?? undefined,
  };
}

// Domain changes -> database columns
function toColumns(d: Partial<TaskData>): TaskColumns {
  const c: TaskColumns = {};
  if (d.title !== undefined) c.title = d.title;
  if (d.status !== undefined) c.status = d.status;
  if (d.priority !== undefined) c.priority = d.priority;
  if (d.createdAt !== undefined) c.createdAt = new Date(d.createdAt);
  // Prisma treats `undefined` as "leave alone", but here a PRESENT key means "set or clear it"
  if ("dueDate" in d) c.dueDate = d.dueDate ? new Date(d.dueDate) : null;
  if ("projectId" in d) c.projectId = d.projectId ?? null;
  return c;
}

export class PrismaTaskRepository implements Repository<Task> {
  constructor(private readonly prisma: PrismaClient) {}

  async findAll() {
    const rows = await this.prisma.task.findMany({ orderBy: { id: "asc" } });
    return rows.map(toTask);
  }

  async findById(id: number) {
    const row = await this.prisma.task.findUnique({ where: { id } });
    return row ? toTask(row) : undefined;
  }
  async insert(data: TaskData) {
    try {
      const row = await this.prisma.task.create({ data: { ...toColumns(data), title: data.title } });
      return toTask(row);
    } catch (err) {
      throw mapWriteError(err);
    }
  }

  async update(id: number, changes: Partial<TaskData>) {
    try {
      return toTask(await this.prisma.task.update({ where: { id }, data: toColumns(changes) }));
    } catch (err) {
      if (isPrismaError(err, "P2025")) return undefined;
      throw mapWriteError(err);
    }
  }

  async remove(id: number) {
    try {
      return toTask(await this.prisma.task.delete({ where: { id } }));
    } catch (err) {
      if (isPrismaError(err, "P2025")) return undefined;
      throw err;
    }
  }
}