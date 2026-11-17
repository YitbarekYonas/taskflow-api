import { describe, expect, it, vi } from "vitest";
import { SYSTEM } from "../../../src/auth/policy.js";
import type { Cache } from "../../../src/cache/cache.js";
import { NotFoundError } from "../../../src/errors.js";
import { createStatsService } from "../../../src/services/stats.service.js";
import type { Role } from "../../../src/types.js";

function setup(opts: { roles?: Record<string, Role>; now?: Date } = {}) {
  const tasks = {
    projectStats: vi.fn(async () => ({
      groups: [
        { status: "todo" as const, priority: "high" as const, count: 2 },
        { status: "todo" as const, priority: "low" as const, count: 1 },
        { status: "done" as const, priority: "high" as const, count: 4 },
      ],
      overdue: 2,
      dueSoon: 1,
    })),
  };
  const cache = {
    getOrCompute: vi.fn(async (o: { compute: () => Promise<unknown> }) => ({
      value: await o.compute(),
      status: "miss" as const,
    })),
    invalidate: vi.fn(async () => {}),
  };
  const members = {
    roleOf: async (projectId: number, userId: number) => opts.roles?.[`${projectId}:${userId}`],
  };
  const service = createStatsService({
    tasks,
    members,
    cache: cache as unknown as Cache,
    now: () => opts.now ?? new Date("2026-11-15T10:00:00Z"),
  });
  return { service, tasks, cache };
}

describe("getProjectStats", () => {
  it("adds the groups up by status and by priority, filling in zeros", async () => {
    const { service } = setup({ roles: { "7:1": "member" } });

    const { value } = await service.getProjectStats(7, { kind: "user", id: 1 });

    expect(value).toMatchObject({
      projectId: 7,
      total: 7,
      byStatus: { todo: 3, in_progress: 0, done: 4 },
      byPriority: { low: 1, medium: 0, high: 6 },
      overdue: 2,
      dueSoon: 1,
    });
  });

  it("stamps the answer with the UTC date and the time it was computed", async () => {
    const { service } = setup({ roles: { "7:1": "member" } });

    const { value } = await service.getProjectStats(7, { kind: "user", id: 1 });

    expect(value).toMatchObject({ asOf: "2026-11-15", computedAt: "2026-11-15T10:00:00.000Z" });
  });

  it("builds the cache key from the project and the date", async () => {
    const { service, cache } = setup({ roles: { "7:1": "member" } });

    await service.getProjectStats(7, { kind: "user", id: 1 });

    expect(cache.getOrCompute).toHaveBeenCalledWith(
      expect.objectContaining({
        namespace: "project-stats",
        scope: "project:7",
        variant: "2026-11-15",
        ttlSeconds: 60,
      }),
    );
  });

  it("uses a different key after midnight UTC", async () => {
    const before = setup({ roles: { "7:1": "member" }, now: new Date("2026-11-15T23:59:59Z") });
    const after = setup({ roles: { "7:1": "member" }, now: new Date("2026-11-16T00:00:00Z") });

    await before.service.getProjectStats(7, { kind: "user", id: 1 });
    await after.service.getProjectStats(7, { kind: "user", id: 1 });

    const variantOf = (cache: typeof before.cache) =>
      (cache.getOrCompute.mock.calls[0][0] as unknown as { variant: string }).variant;
    expect(variantOf(before.cache)).toBe("2026-11-15");
    expect(variantOf(after.cache)).toBe("2026-11-16");
  });

  it("checks access BEFORE the cache or the database is touched", async () => {
    const { service, cache, tasks } = setup({ roles: { "7:1": "member" } });

    await expect(service.getProjectStats(7, { kind: "user", id: 99 })).rejects.toBeInstanceOf(
      NotFoundError,
    );

    expect(cache.getOrCompute).not.toHaveBeenCalled();
    expect(tasks.projectStats).not.toHaveBeenCalled();
  });

  it("answers a member of a different project exactly like a stranger", async () => {
    const { service } = setup({ roles: { "8:1": "owner" } });
    await expect(service.getProjectStats(7, { kind: "user", id: 1 })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("lets the system through", async () => {
    const { service } = setup();
    await expect(service.getProjectStats(7, SYSTEM)).resolves.toMatchObject({ status: "miss" });
  });
});

describe("invalidateProject", () => {
  it("invalidates exactly that project's scope", async () => {
    const { service, cache } = setup();
    await service.invalidateProject(7);
    expect(cache.invalidate).toHaveBeenCalledWith("project-stats", "project:7");
  });
});
