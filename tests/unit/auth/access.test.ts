import { describe, expect, it } from "vitest";
import { createAccess } from "../../../src/auth/access.js";
import { assertSystem, creatorOf, SYSTEM, type Actor } from "../../../src/auth/policy.js";
import { ForbiddenError, NotFoundError } from "../../../src/errors.js";
import type { Role, Task } from "../../../src/types.js";

// A fake: a tiny working implementation of the part of MemberRepository the rules use
function fakeMembers(roles: Record<string, Role>) {
  return {
    roleOf: async (projectId: number, userId: number) => roles[`${projectId}:${userId}`],
  };
}

const user = (id: number): Actor => ({ kind: "user", id });
const task = (overrides: Partial<Task> = {}): Task => ({
  id: 1,
  title: "A task",
  status: "todo",
  priority: "medium",
  createdAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

describe("requireProjectRole", () => {
  it.each([
    { role: "owner", minimum: "owner", outcome: "ok" },
    { role: "owner", minimum: "member", outcome: "ok" },
    { role: "member", minimum: "member", outcome: "ok" },
    { role: "member", minimum: "owner", outcome: "forbidden" },
    { role: undefined, minimum: "member", outcome: "not-found" },
    { role: undefined, minimum: "owner", outcome: "not-found" },
  ] as const)("$role needing $minimum -> $outcome", async ({ role, minimum, outcome }) => {
    const access = createAccess(fakeMembers(role ? { "10:1": role } : {}));
    const result = access.requireProjectRole(user(1), 10, minimum);

    if (outcome === "ok") {
      await expect(result).resolves.toBe(role);
    } else {
      const expected = outcome === "forbidden" ? ForbiddenError : NotFoundError;
      await expect(result).rejects.toBeInstanceOf(expected);
    }
  });

  it("treats a member of a different project as a stranger", async () => {
    const access = createAccess(fakeMembers({ "11:1": "owner" }));
    await expect(access.requireProjectRole(user(1), 10, "member")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("lets the system act as owner everywhere", async () => {
    const access = createAccess(fakeMembers({}));
    await expect(access.requireProjectRole(SYSTEM, 10, "owner")).resolves.toBe("owner");
  });
});

describe("taskRole", () => {
  const access = createAccess(fakeMembers({ "10:1": "member", "10:2": "owner" }));

  it("uses the project role for a task inside a project", async () => {
    expect(await access.taskRole(user(1), task({ projectId: 10 }))).toBe("member");
    expect(await access.taskRole(user(2), task({ projectId: 10 }))).toBe("owner");
    expect(await access.taskRole(user(3), task({ projectId: 10 }))).toBeUndefined();
  });

  it("makes the creator the owner of a personal task", async () => {
    const personal = task({ createdById: 5 });
    expect(await access.taskRole(user(5), personal)).toBe("owner");
    expect(await access.taskRole(user(6), personal)).toBeUndefined();
  });

  it("hides legacy tasks that have neither project nor creator", async () => {
    expect(await access.taskRole(user(1), task())).toBeUndefined();
  });

  it("lets the system see everything", async () => {
    expect(await access.taskRole(SYSTEM, task())).toBe("owner");
  });
});

describe("requireTaskRole", () => {
  const access = createAccess(fakeMembers({ "10:1": "member" }));

  it("answers 404 for a task the caller cannot see", async () => {
    await expect(access.requireTaskRole(user(9), task({ projectId: 10 }), "member")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("answers 403 for a visible task that needs more rights", async () => {
    await expect(access.requireTaskRole(user(1), task({ projectId: 10 }), "owner")).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("policy helpers", () => {
  it("reads the creator from a user actor only", () => {
    expect(creatorOf(user(7))).toBe(7);
    expect(creatorOf(SYSTEM)).toBeUndefined();
  });

  it("allows system-only operations for the system and rejects users", () => {
    expect(() => assertSystem(SYSTEM)).not.toThrow();
    expect(() => assertSystem(user(1))).toThrow(ForbiddenError);
  });
});