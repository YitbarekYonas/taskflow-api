import type { RefreshToken as RefreshTokenRow } from "../../generated/prisma/client.js";
import type { RefreshTokenRecord, RefreshTokenRepository } from "../refreshTokenRepository.js";
import type { Db } from "./db.js";

function toRecord(row: RefreshTokenRow): RefreshTokenRecord {
  return {
    id: row.id,
    userId: row.userId,
    familyId: row.familyId,
    expiresAt: row.expiresAt,
    usedAt: row.usedAt ?? undefined,
    revokedAt: row.revokedAt ?? undefined,
  };
}

export class PrismaRefreshTokenRepository implements RefreshTokenRepository {
  constructor(private readonly prisma: Db) {}

  async create(data: { userId: number; tokenHash: string; familyId: string; expiresAt: Date }) {
    await this.prisma.refreshToken.create({ data });
  }

  async findByHash(tokenHash: string) {
    const row = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });
    return row ? toRecord(row) : undefined;
  }

  // One SQL statement: the WHERE clause is the lock. If two requests race, only one updates a row.
  async markUsed(id: number) {
    const result = await this.prisma.refreshToken.updateMany({
      where: { id, usedAt: null, revokedAt: null },
      data: { usedAt: new Date() },
    });
    return result.count === 1;
  }

  async revokeFamily(familyId: string) {
    const result = await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return result.count;
  }

  async revokeAllForUser(userId: number) {
    const result = await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return result.count;
  }

  async deleteExpired(now: Date) {
    const result = await this.prisma.refreshToken.deleteMany({ where: { expiresAt: { lt: now } } });
    return result.count;
  }
}