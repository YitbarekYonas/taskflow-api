import { hashPassword } from "../../src/auth/password.js";
import { prisma } from "../../src/db.js";

export const TEST_PASSWORD = "correct-horse-battery";

// Argon2 is slow on purpose, so hash once and reuse the result
let cachedHash: Promise<string> | undefined;
export const testPasswordHash = () => (cachedHash ??= hashPassword(TEST_PASSWORD));

let counter = 0;

// Inserts a user directly: much faster than registering through the API,
// and a login test then cannot fail because registration broke.
export async function createUser(
  overrides: { email?: string; name?: string; passwordHash?: string } = {}
) {
  const n = ++counter;
  return prisma.user.create({
    data: {
      email: overrides.email ?? `user${n}@example.com`,
      name: overrides.name ?? `User ${n}`,
      passwordHash: overrides.passwordHash ?? (await testPasswordHash()),
    },
  });
}