import type { ProjectRepository, Repository } from "../repositories/repository.js";
import { NewProject, ProjectPatch } from "../schemas/project.schemas.js";
import type { TaskQuery } from "../schemas/task.schemas.js";
import { Project, Task } from "../types.js";
import {TaskRepository} from "../repositories/repository.js";
import {buildMeta} from "./pagination.js";
import { ConflictError, InUseError, InvalidReferenceError, NotFoundError, UserError } from "../errors.js";
import type { UnitOfWork } from "../repositories/unitOfWork.js";
import type { DuplicateProject } from "../schemas/project.schemas.js";
import { makeSlug } from "./slug.js";
import { Actor, assertOwner, creatorOf } from "../auth/policy.js";

type Deps = { projects: ProjectRepository; tasks: TaskRepository; uow: UnitOfWork };

export function createProjectService({ projects, tasks, uow }: Deps) {
  async function getProject(id: number): Promise<Project> {
    const project = await projects.findById(id);
    if (!project) throw new NotFoundError(`No project with id ${id}.`);
    return project;
  }

  async function createProject(input: NewProject, actor: Actor): Promise<Project> {
    return projects.insert({
      name: input.name,
      slug: makeSlug(input.name),
      description: input.description,
      createdAt: new Date().toISOString(),
      createdById: creatorOf(actor),
    });
  }

  async function updateProject(id: number, patch: ProjectPatch, actor: Actor): Promise<Project> {
    assertOwner(actor, (await getProject(id)).createdById, "project");
    const updated = await projects.update(id, patch);
    if (!updated) throw new NotFoundError(`No project with id ${id}.`);
    return updated;
  }
  async function listProjects() {
    return projects.findAllWithTaskCount(); // one query for all counts
  }

  async function deleteProject(id: number, actor: Actor): Promise<void> {
    assertOwner(actor, (await getProject(id)).createdById, "project");
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

  async function listProjectTasks(id: number, q: Omit<TaskQuery, "projectId">) {
    await getProject(id);
    const { items, total } = await tasks.query({ ...q, projectId: id });
    return { items, meta: buildMeta(total, q.page, q.limit) };
  }
    async function duplicateProject(
  id: number,
  input: DuplicateProject,
  actor: Actor
): Promise<{ project: Project; copiedTasks: number }> {
  return uow.run(async (tx) => {
    const source = await tx.projects.findById(id);
    if (!source) throw new NotFoundError(`No project with id ${id}.`);

    const now = new Date().toISOString();
    const copy = await tx.projects.insert({
      name: input.name ?? `${source.name} (copy)`,
      slug: makeSlug(input.name ?? source.name),
      description: source.description,
      createdAt: now,
      createdById: creatorOf(actor), 
    });

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
  async function mergeProjects(
  sourceId: number,
  targetId: number,
  actor: Actor
): Promise<{ project: Project; movedTasks: number }> {
  if (sourceId === targetId) throw new UserError("A project cannot be merged into itself.");

  try {
    return await uow.run(async (tx) => {

      const source = await tx.projects.findById(sourceId);
      if (!source) throw new NotFoundError(`No project with id ${sourceId}.`);
      assertOwner(actor, source.createdById, "source project"); // 👈 Added

      const target = await tx.projects.findById(targetId);
      if (!target) throw new UserError(`Project ${targetId} does not exist.`);
      assertOwner(actor, target.createdById, "target project");

      const movedTasks = await tx.tasks.moveAll(sourceId, targetId);
      await tx.projects.remove(sourceId);
      
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

  return { getProject, listProjects, createProject, updateProject, deleteProject,listProjectTasks, duplicateProject, mergeProjects };
}