import { DuplicateError } from "../../errors.js";
import type { User as UserRow } from "../../generated/prisma/client.js";
import type { User } from "../../types.js";
import type { UserRecord, UserRepository } from "../userRepository.js";
import type { Db } from "./db.js";
import { isPrismaError } from "./errors.js";

// Accepts a row with or without the hash: this function never reads it
function toUser(row: Omit<UserRow, "passwordHash">): User {
  return { id: row.id, email: row.email, name: row.name, createdAt: row.createdAt.toISOString() };
}

export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: Db) {}

  async findById(id: number) {
    const row = await this.prisma.user.findUnique({ where: { id } });
    return row ? toUser(row) : undefined;
  }

  async findByEmail(email: string): Promise<UserRecord | undefined> {
    const row = await this.prisma.user.findUnique({ where: { email } });
    return row ? { ...toUser(row), passwordHash: row.passwordHash } : undefined;
  }

  async create(data: { email: string; name: string; passwordHash: string }) {
    try {
        return toUser(
        await this.prisma.user.create({
          data,
          omit: { passwordHash: true },
        })
      );
    } catch (err) {
      // The unique constraint decides, not a racy "does it exist?" check
      if (isPrismaError(err, "P2002")) {
        throw new DuplicateError("An account with this email already exists.");
      }
      throw err;
    }
  }
}