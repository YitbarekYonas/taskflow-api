import type { Project as ProjectRow } from "../../generated/prisma/client.js";
import type { Db } from "./db.js";
import type { Project } from "../../types.js";
import type { ProjectRepository, Repository } from "../repository.js";
import { isPrismaError, mapDeleteError } from "./errors.js";
import { mapWriteError } from "./errors.js";

type ProjectData = Omit<Project, "id">;

function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
     slug: row.slug,
    description: row.description ?? undefined,
    createdAt: row.createdAt.toISOString(),
    createdById: row.createdById ?? undefined,
  };
}

function toColumns(d: Partial<ProjectData>) {
  const c: { 
    name?: string; 
    slug?: string; 
    description?: string | null; 
    createdAt?: Date
    createdById?: number; 
  } = {};
  
  if (d.name !== undefined) c.name = d.name;
  if (d.slug !== undefined) c.slug = d.slug; 
  if (d.createdAt !== undefined) c.createdAt = new Date(d.createdAt);
  if ("description" in d) c.description = d.description ?? null;
  if (d.createdById !== undefined) c.createdById = d.createdById;
  return c;
}

export class PrismaProjectRepository  implements ProjectRepository {
  constructor(private readonly prisma: Db) {}

  async findAll() {
    return (await this.prisma.project.findMany({ orderBy: { id: "asc" } })).map(toProject);
  }

  async findById(id: number) {
    const row = await this.prisma.project.findUnique({ where: { id } });
    return row ? toProject(row) : undefined;
  }

  async insert(data: ProjectData) {
    return toProject(
      await this.prisma.project.create({ data: { ...toColumns(data), name: data.name } })
    );
  }

  async update(id: number, changes: Partial<ProjectData>) {
    try {
      return toProject(await this.prisma.project.update({ where: { id }, data: toColumns(changes) }));
    } catch (err) {
      if (isPrismaError(err, "P2025")) return undefined;
      throw err;
    }
  }

  async remove(id: number) {
    try {
      return toProject(await this.prisma.project.delete({ where: { id } }));
    } catch (err) {
      if (isPrismaError(err, "P2025")) return undefined;
      throw mapDeleteError(err);
    }
  }
    async findAllWithTaskCount() {
    const rows = await this.prisma.project.findMany({
      orderBy: { id: "asc" },
      include: { _count: { select: { tasks: true } } },
    });
    return rows.map((row) => ({ ...toProject(row), taskCount: row._count.tasks }));
  }
}