import type { Comment as CommentRow } from "../../generated/prisma/client.js";
import type { Db } from "./db.js";
import type { Comment } from "../../types.js";
import type { Repository } from "../repository.js";
import { isPrismaError } from "./errors.js";
import { mapWriteError } from "./errors.js";

type CommentData = Omit<Comment, "id">;

function toComment(row: CommentRow): Comment {
  return {
    id: row.id,
    taskId: row.taskId,
    author: row.author,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt?.toISOString(),
  };
}

function toColumns(d: Partial<CommentData>) {
  const c: {
    taskId?: number; author?: string; body?: string; createdAt?: Date; updatedAt?: Date | null;
  } = {};
  if (d.taskId !== undefined) c.taskId = d.taskId;
  if (d.author !== undefined) c.author = d.author;
  if (d.body !== undefined) c.body = d.body;
  if (d.createdAt !== undefined) c.createdAt = new Date(d.createdAt);
  if ("updatedAt" in d) c.updatedAt = d.updatedAt ? new Date(d.updatedAt) : null;
  return c;
}

export class PrismaCommentRepository implements Repository<Comment> {
  constructor(private readonly prisma: Db) {}

  async findAll() {
    return (await this.prisma.comment.findMany({ orderBy: { id: "asc" } })).map(toComment);
  }

  async findById(id: number) {
    const row = await this.prisma.comment.findUnique({ where: { id } });
    return row ? toComment(row) : undefined;
  }

  async insert(data: CommentData) {
    try {
      const row = await this.prisma.comment.create({ data: { ...toColumns(data), taskId: data.taskId, author: data.author, body: data.body } });
      return toComment(row);
    } catch (err) {
      throw mapWriteError(err);
    }
  }

  async update(id: number, changes: Partial<CommentData>) {
    try {
      return toComment(await this.prisma.comment.update({ where: { id }, data: toColumns(changes) }));
    } catch (err) {
      if (isPrismaError(err, "P2025")) return undefined;
      throw mapWriteError(err);
    }
  }

  async remove(id: number) {
    try {
      return toComment(await this.prisma.comment.delete({ where: { id } }));
    } catch (err) {
      if (isPrismaError(err, "P2025")) return undefined;
      throw err;
    }
  }
}