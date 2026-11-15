import { createAccess } from "../auth/access.js";
import type { Actor } from "../auth/policy.js";
import type { Cache } from "../cache/cache.js";
import type { MemberRepository } from "../repositories/memberRepository.js";
import type { TaskRepository } from "../repositories/repository.js";
import { projectStatsSchema, type ProjectStats } from "../schemas/stats.schemas.js";
import { todayUtc } from "./dates.js";

const NAMESPACE = "project-stats";
const TTL_SECONDS = 60; // the longest a wrong answer can live if an invalidation is ever missed

// What the other services need: a way to say "this project's tasks changed"
export type StatsInvalidator = { invalidateProject(projectId: number): Promise<void> };

type Deps = {
  tasks: Pick<TaskRepository, "projectStats">;
  members: Pick<MemberRepository, "roleOf">;
  cache: Pick<Cache, "getOrCompute" | "invalidate">;
  now?: () => Date;
};

export function createStatsService({ tasks, members, cache, now = () => new Date() }: Deps) {
  const access = createAccess(members);
  const scopeOf = (projectId: number) => `project:${projectId}`;

  async function compute(projectId: number, today: string): Promise<ProjectStats> {
    const { groups, overdue, dueSoon } = await tasks.projectStats(projectId, today);

    const byStatus = { todo: 0, in_progress: 0, done: 0 };
    const byPriority = { low: 0, medium: 0, high: 0 };
    let total = 0;
    for (const group of groups) {
      byStatus[group.status] += group.count;
      byPriority[group.priority] += group.count;
      total += group.count;
    }
    return {
      projectId,
      total,
      byStatus,
      byPriority,
      overdue,
      dueSoon,
      asOf: today,
      computedAt: now().toISOString(),
    };
  }

  async function getProjectStats(projectId: number, actor: Actor) {
    // 1. Authorization FIRST. A cached answer must never reach someone who may not see it.
    //    A stranger gets a 404, exactly as for a project that does not exist.
    await access.requireProjectRole(actor, projectId, "member");

    // 2. Only now touch the cache. The key holds everything the answer depends on:
    //    the project and the UTC date (overdue changes at midnight).
    const today = todayUtc(now());
    return cache.getOrCompute({
      namespace: NAMESPACE,
      scope: scopeOf(projectId),
      variant: today,
      ttlSeconds: TTL_SECONDS,
      schema: projectStatsSchema,
      compute: () => compute(projectId, today),
    });
  }

  async function invalidateProject(projectId: number): Promise<void> {
    await cache.invalidate(NAMESPACE, scopeOf(projectId));
  }

  return { getProjectStats, invalidateProject };
}

export type StatsService = ReturnType<typeof createStatsService>;
