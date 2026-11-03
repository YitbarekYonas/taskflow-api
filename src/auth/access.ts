import { ForbiddenError, NotFoundError } from "../errors.js";
import type { MemberRepository } from "../repositories/memberRepository.js";
import type { Role, Task } from "../types.js";
import type { Actor } from "./policy.js";

const RANK: Record<Role, number> = { member: 1, owner: 2 };

// Takes the member repository as an argument, so it works with the normal one
// AND with the transaction-bound one inside a UnitOfWork.
export function createAccess(members: Pick<MemberRepository, "roleOf">) {
  async function projectRole(actor: Actor, projectId: number): Promise<Role | undefined> {
    if (actor.kind === "system") return "owner";
    return members.roleOf(projectId, actor.id);
  }

  // 404 for strangers (existence stays private), 403 for members without enough rights
  async function requireProjectRole(actor: Actor, projectId: number, minimum: Role): Promise<Role> {
    const role = await projectRole(actor, projectId);
    if (!role) throw new NotFoundError(`No project with id ${projectId}.`);
    if (RANK[role] < RANK[minimum]) {
      throw new ForbiddenError("You do not have permission to do this in this project.");
    }
    return role;
  }

  // A task's role comes from its project, or, for a personal task, from being its creator
  async function taskRole(actor: Actor, task: Task): Promise<Role | undefined> {
    if (actor.kind === "system") return "owner";
    if (task.projectId !== undefined) return members.roleOf(task.projectId, actor.id);
    return task.createdById === actor.id ? "owner" : undefined;
  }

  async function requireTaskRole(actor: Actor, task: Task, minimum: Role): Promise<Role> {
    const role = await taskRole(actor, task);
    if (!role) throw new NotFoundError(`No task with id ${task.id}.`);
    if (RANK[role] < RANK[minimum]) {
      throw new ForbiddenError("You do not have permission to do this.");
    }
    return role;
  }

  return { projectRole, requireProjectRole, taskRole, requireTaskRole };
}