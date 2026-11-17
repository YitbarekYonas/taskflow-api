import {
  generateRefreshToken,
  hashRefreshToken,
  newFamilyId,
} from "../../src/auth/refreshTokens.js";
import { prisma } from "../../src/db.js";

export async function startSession(
  user: { id: number },
  opts: { familyId?: string; expiresAt?: Date } = {},
) {
  const token = generateRefreshToken();
  const familyId = opts.familyId ?? newFamilyId();
  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hashRefreshToken(token),
      familyId,
      expiresAt: opts.expiresAt ?? new Date(Date.now() + 86_400_000),
    },
  });
  return { token, familyId };
}

export const rowFor = (token: string) =>
  prisma.refreshToken.findUniqueOrThrow({ where: { tokenHash: hashRefreshToken(token) } });
