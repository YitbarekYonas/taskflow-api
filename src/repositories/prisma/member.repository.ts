import { DuplicateError, InvalidReferenceError } from "../../errors.js";
import type { Role } from "../../types.js";
import type { MemberRepository } from "../memberRepository.js";
import type { Db } from "./db.js";
import { isPrismaError } from "./errors.js";

export class PrismaMemberRepository implements MemberRepository {
  constructor(private readonly prisma: Db) {}

  async roleOf(projectId: number, userId: number) {
    const row = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
      select: { role: true },
    });
    return row?.role;
  }

  async list(projectId: number) {
    const rows = await this.prisma.projectMember.findMany({
      where: { projectId },
      include: { user: { select: { name: true } } },
      orderBy: [{ joinedAt: "asc" }, { userId: "asc" }],
    });
    return rows.map((r) => ({
      userId: r.userId,
      name: r.user.name,
      role: r.role,
      joinedAt: r.joinedAt.toISOString(),
    }));
  }

  async add(projectId: number, userId: number, role: Role) {
    try {
      await this.prisma.projectMember.create({ data: { projectId, userId, role } });
    } catch (err) {
      if (isPrismaError(err, "P2002"))
        throw new DuplicateError("This user is already a member of the project.");
      if (isPrismaError(err, "P2003"))
        throw new InvalidReferenceError("The project or user does not exist.");
      throw err;
    }
  }

  async setRole(projectId: number, userId: number, role: Role) {
    const result = await this.prisma.projectMember.updateMany({
      where: { projectId, userId },
      data: { role },
    });
    return result.count === 1;
  }

  async remove(projectId: number, userId: number) {
    const result = await this.prisma.projectMember.deleteMany({ where: { projectId, userId } });
    return result.count === 1;
  }

  async countOwners(projectId: number) {
    return this.prisma.projectMember.count({ where: { projectId, role: "owner" } });
  }

  async lockProject(projectId: number) {
    const rows = await this.prisma.$queryRaw<{ id: number }[]>`
      SELECT id FROM projects WHERE id = ${projectId} FOR UPDATE`;
    return rows.length === 1;
  }
}
