import { createAccess } from "../auth/access.js";
import { creatorOf, type Actor } from "../auth/policy.js";
import {
  ConflictError, ForbiddenError, InUseError, InvalidReferenceError, NotFoundError, UserError,
} from "../errors.js";
import type { MemberRepository } from "../repositories/memberRepository.js";
import type { ProjectRepository, TaskRepository } from "../repositories/repository.js";
import type { UnitOfWork } from "../repositories/unitOfWork.js";
import type {
  AddMember, DuplicateProject, NewProject, ProjectPatch,
} from "../schemas/project.schemas.js";
import type { TaskQuery } from "../schemas/task.schemas.js";
import type { Project, Role } from "../types.js";
import { buildMeta } from "./pagination.js";
import { makeSlug } from "./slug.js";

type Deps = {
  projects: ProjectRepository;
  tasks: TaskRepository;
  members: MemberRepository;
  uow: UnitOfWork;
};

export function createProjectService({ projects, tasks, members, uow }: Deps) {
  const access = createAccess(members);

  async function getProject(id: number, actor: Actor): Promise<Project> {
    await access.requireProjectRole(actor, id, "member"); // 404 for strangers
    const project = await projects.findById(id);
    if (!project) throw new NotFoundError(`No project with id ${id}.`);
    return project;
  }

  async function listProjects(actor: Actor) {
    return projects.findAllWithTaskCount(actor.kind === "user" ? { userId: actor.id } : undefined);
  }

  // The project and its first owner are created together, or not at all
  async function createProject(input: NewProject, actor: Actor): Promise<Project> {
    return uow.run(async (tx) => {
      const project = await tx.projects.insert({
        name: input.name,
        description: input.description,
        slug: makeSlug(input.name),
        createdAt: new Date().toISOString(),
        createdById: creatorOf(actor),
      });
      if (actor.kind === "user") await tx.members.add(project.id, actor.id, "owner");
      return project;
    });
  }

  async function updateProject(id: number, patch: ProjectPatch, actor: Actor): Promise<Project> {
    await access.requireProjectRole(actor, id, "owner");
    const updated = await projects.update(id, patch);
    if (!updated) throw new NotFoundError(`No project with id ${id}.`);
    return updated;
  }

  async function deleteProject(id: number, actor: Actor): Promise<void> {
    await access.requireProjectRole(actor, id, "owner");
    try {
      const removed = await projects.remove(id);
      if (!removed) throw new NotFoundError(`No project with id ${id}.`);
    } catch (err) {
      if (err instanceof InUseError) {
        throw new ConflictError(`Project ${id} still has tasks. Move or delete them first.`);
      }
      throw err;
    }
  }

  async function listProjectTasks(id: number, q: Omit<TaskQuery, "projectId">, actor: Actor) {
    await getProject(id, actor); // membership implies visibility of every task inside
    const { items, total } = await tasks.query({ ...q, projectId: id } as TaskQuery);
    return { items, meta: buildMeta(total, q.page, q.limit) };
  }

  async function duplicateProject(id: number, input: DuplicateProject, actor: Actor) {
    return uow.run(async (tx) => {
      await createAccess(tx.members).requireProjectRole(actor, id, "member");
      const source = await tx.projects.findById(id);
      if (!source) throw new NotFoundError(`No project with id ${id}.`);

      const now = new Date().toISOString();
      const copy = await tx.projects.insert({
        name: input.name ?? `${source.name} (copy)`,
        description: source.description,
        slug: makeSlug(input.name ?? source.name),
        createdAt: now,
        createdById: creatorOf(actor),
      });
      if (actor.kind === "user") await tx.members.add(copy.id, actor.id, "owner");

      const originals = await tx.tasks.findByProject(id);
      const copiedTasks = await tx.tasks.insertMany(
        originals.map((t) => ({
          title: t.title,
          status: "todo" as const,
          priority: t.priority,
          dueDate: t.dueDate,
          createdAt: now,
          projectId: copy.id,
          createdById: creatorOf(actor),
        }))
      );
      return { project: copy, copiedTasks };
    });
  }

  async function mergeProjects(sourceId: number, targetId: number, actor: Actor) {
    if (sourceId === targetId) throw new UserError("A project cannot be merged into itself.");

    try {
      return await uow.run(async (tx) => {
        const txAccess = createAccess(tx.members);
        await txAccess.requireProjectRole(actor, sourceId, "owner"); // 404 stranger, 403 member

        // An invisible target looks exactly like a missing one
        const targetRole = await txAccess.projectRole(actor, targetId);
        if (!targetRole) throw new UserError(`Project ${targetId} does not exist.`);
        if (targetRole !== "owner") throw new ForbiddenError("You must own both projects to merge them.");

        const target = await tx.projects.findById(targetId);
        if (!target) throw new UserError(`Project ${targetId} does not exist.`);

        const movedTasks = await tx.tasks.moveAll(sourceId, targetId);
        await tx.projects.remove(sourceId); // the source's memberships are removed with it (cascade)
        return { project: target, movedTasks };
      });
    } catch (err) {
      if (err instanceof InUseError) {
        throw new ConflictError("Tasks were added to the project during the merge. Please retry.");
      }
      if (err instanceof InvalidReferenceError) {
        throw new UserError(`Project ${targetId} does not exist.`);
      }
      throw err;
    }
  }

  // ---------------- members ----------------

  async function listMembers(projectId: number, actor: Actor) {
    await access.requireProjectRole(actor, projectId, "member");
    return members.list(projectId);
  }

  async function addMember(projectId: number, input: AddMember, actor: Actor) {
    return uow.run(async (tx) => {
      await createAccess(tx.members).requireProjectRole(actor, projectId, "owner");
      const user = await tx.users.findByEmail(input.email);
      if (!user) throw new NotFoundError("No user with that email.");
      await tx.members.add(projectId, user.id, input.role); // 409 if already a member
      return { userId: user.id, name: user.name, role: input.role };
    });
  }

  async function changeRole(projectId: number, userId: number, role: Role, actor: Actor) {
    return uow.run(async (tx) => {
      const txAccess = createAccess(tx.members);
      await txAccess.requireProjectRole(actor, projectId, "owner"); // cheap: keeps strangers from taking locks
      await tx.members.lockProject(projectId);                       // everyone else queues up here
      await txAccess.requireProjectRole(actor, projectId, "owner"); // again: we may have waited behind a demotion

      const current = await tx.members.roleOf(projectId, userId);
      if (!current) throw new NotFoundError(`User ${userId} is not a member of project ${projectId}.`);
      if (current === "owner" && role !== "owner" && (await tx.members.countOwners(projectId)) <= 1) {
        throw new ConflictError("A project must keep at least one owner.");
      }
      await tx.members.setRole(projectId, userId, role);
      return { userId, role };
    });
  }

  // Owners can remove anyone. Anyone can remove themselves ("leave").
  async function removeMember(projectId: number, userId: number, actor: Actor): Promise<void> {
    const leaving = actor.kind === "user" && actor.id === userId;
    const needed: Role = leaving ? "member" : "owner";

    await uow.run(async (tx) => {
      const txAccess = createAccess(tx.members);
      await txAccess.requireProjectRole(actor, projectId, needed);
      await tx.members.lockProject(projectId);
      await txAccess.requireProjectRole(actor, projectId, needed);

      const current = await tx.members.roleOf(projectId, userId);
      if (!current) throw new NotFoundError(`User ${userId} is not a member of project ${projectId}.`);
      if (current === "owner" && (await tx.members.countOwners(projectId)) <= 1) {
        throw new ConflictError("A project must keep at least one owner. Promote someone else first.");
      }
      await tx.members.remove(projectId, userId);
    });
  }

  return {
    getProject, listProjects, createProject, updateProject, deleteProject,
    listProjectTasks, duplicateProject, mergeProjects,
    listMembers, addMember, changeRole, removeMember,
  };
}