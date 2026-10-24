import type { Prisma, PrismaClient, Task as TaskRow } from "../../generated/prisma/client.js";
import type { Db } from "./db.js";
import type { Priority, Status, Task } from "../../types.js";
import type { Repository } from "../repository.js";
import { isPrismaError,mapWriteError } from "./errors.js";
import type { TaskQuery } from "../../schemas/task.schemas.js";
import { TaskRepository } from "../repository.js";

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

function buildWhere(q: TaskQuery): Prisma.TaskWhereInput {
  // `undefined` means "no filter" here, which is exactly the Prisma meaning we want
  return {
    status: q.status,
    priority: q.priority,
    projectId: q.projectId,
    title: q.search ? { contains: q.search, mode: "insensitive" } : undefined,
  };
}

// id is always the last tie-breaker, so pages never overlap or skip rows
function buildOrderBy(sort: TaskQuery["sort"], dir: "asc" | "desc"): Prisma.TaskOrderByWithRelationInput[] {
  switch (sort) {
    case "dueDate":
      return [{ dueDate: { sort: dir, nulls: "last" } }, { id: "asc" }];
    case "title":
      return [{ title: dir }, { id: "asc" }];
    case "priority":
      return [{ priority: dir }, { id: "asc" }];
    case "createdAt":
      return [{ createdAt: dir }, { id: "asc" }];
  }
}
export class PrismaTaskRepository implements TaskRepository {
  constructor(private readonly prisma: Db) {}

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

   async query(q: TaskQuery) {
    const where = buildWhere(q);
    const page = {
      where,
      orderBy: buildOrderBy(q.sort, q.order),
      skip: (q.page - 1) * q.limit,
      take: q.limit,
    };

    let rows: TaskRow[];
    let total: number;
    
    if ("$transaction" in this.prisma) {
      // We have a full PrismaClient, so we can use $transaction
      [rows, total] = await this.prisma.$transaction([
        this.prisma.task.findMany(page),
        this.prisma.task.count({ where }),
      ]);
    } else {
      // We are already inside a transaction.
      // Cast it to PrismaClient just to satisfy TypeScript.
      const client = this.prisma as unknown as PrismaClient;
      rows = await client.task.findMany(page);
      total = await client.task.count({ where });
    }
    return { items: rows.map(toTask), total };
  }

  async findOverdue(today: string) {
    const rows = await this.prisma.task.findMany({
      where: { status: { not: "done" }, dueDate: { lt: new Date(today) } },
      orderBy: [{ dueDate: "asc" }, { id: "asc" }],
    });
    return rows.map(toTask);
  }

  async countByStatus() {
    const groups = await this.prisma.task.groupBy({ by: ["status"], _count: { _all: true } });
    const counts: Record<Status, number> = { todo: 0, in_progress: 0, done: 0 };
    for (const g of groups) counts[g.status] = g._count._all;
    return counts;
  }
    async findByProject(projectId: number) {
    const rows = await this.prisma.task.findMany({ where: { projectId }, orderBy: { id: "asc" } });
    return rows.map(toTask);
  }

  // a single statement: atomic on its own
  async moveAll(fromProjectId: number, toProjectId: number) {
    try {
      const result = await this.prisma.task.updateMany({
        where: { projectId: fromProjectId },
        data: { projectId: toProjectId },
      });
      return result.count;
    } catch (err) {
      throw mapWriteError(err);
    }
  }

  async insertMany(items: TaskData[]) {
    try {
      const result = await this.prisma.task.createMany({
        data: items.map((i) => ({ ...toColumns(i), title: i.title })),
      });
      return result.count;
    } catch (err) {
      throw mapWriteError(err);
    }
  }
}