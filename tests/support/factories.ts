import { hashPassword } from "../../src/auth/password.js";
import { prisma } from "../../src/db.js";
import type { Priority, Status } from "../../src/types.js";

export const TEST_PASSWORD = "correct-horse-battery";

// Argon2 is slow on purpose, so hash once and reuse the result
let cachedHash: Promise<string> | undefined;
export const testPasswordHash = () => (cachedHash ??= hashPassword(TEST_PASSWORD));

let counter = 0;

type Person = { id: number };

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

// The owner becomes an owner member, exactly like creating a project through the API
export async function createProject(opts: {
  owner: Person;
  members?: Array<{ user: Person; role?: "owner" | "member" }>;
  name?: string;
}) {
  const n = ++counter;
  return prisma.project.create({
    data: {
      name: opts.name ?? `Project ${n}`,
      slug: `project-${n}`,
      createdById: opts.owner.id,
      members: {
        create: [
          { userId: opts.owner.id, role: "owner" },
          ...(opts.members ?? []).map((m) => ({ userId: m.user.id, role: m.role ?? "member" })),
        ],
      },
    },
  });
}

export async function createTask(
  opts: {
    title?: string;
    status?: Status;
    priority?: Priority;
    dueDate?: string;
    createdAt?: string;
    project?: Person;
    createdBy?: Person;
  } = {}
) {
  const n = ++counter;
  return prisma.task.create({
    data: {
      title: opts.title ?? `Task ${n}`,
      status: opts.status ?? "todo",
      priority: opts.priority ?? "medium",
      dueDate: opts.dueDate ? new Date(opts.dueDate) : null,
      createdAt: opts.createdAt ? new Date(opts.createdAt) : undefined,
      projectId: opts.project?.id ?? null,
      createdById: opts.createdBy?.id ?? null,
    },
  });
}