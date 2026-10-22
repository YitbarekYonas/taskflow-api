import type { PrismaClient, Project as ProjectRow } from "../../generated/prisma/client.js";
import type { Project } from "../../types.js";
import type { Repository } from "../repository.js";
import { isPrismaError } from "./errors.js";

type ProjectData = Omit<Project, "id">;

function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    createdAt: row.createdAt.toISOString(),
  };
}

function toColumns(d: Partial<ProjectData>) {
  const c: { name?: string; description?: string | null; createdAt?: Date } = {};
  if (d.name !== undefined) c.name = d.name;
  if (d.createdAt !== undefined) c.createdAt = new Date(d.createdAt);
  if ("description" in d) c.description = d.description ?? null;
  return c;
}

export class PrismaProjectRepository implements Repository<Project> {
  constructor(private readonly prisma: PrismaClient) {}

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
      throw err;
    }
  }
}