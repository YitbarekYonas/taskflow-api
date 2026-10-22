import { ConflictError, InUseError, NotFoundError } from "../errors.js";
import type { ProjectRepository, Repository } from "../repositories/repository.js";
import { NewProject, ProjectPatch } from "../schemas/project.schemas.js";
import type { TaskQuery } from "../schemas/task.schemas.js";
import { Project, Task } from "../types.js";
import { applyQuery } from "./taskQuery.js";

type Deps = { projects: ProjectRepository; tasks: Repository<Task> };

export function createProjectService({ projects, tasks }: Deps) {
  async function getProject(id: number): Promise<Project> {
    const project = await projects.findById(id);
    if (!project) throw new NotFoundError(`No project with id ${id}.`);
    return project;
  }

  async function createProject(input: NewProject): Promise<Project> {
    return projects.insert({
      name: input.name,
      description: input.description,
      createdAt: new Date().toISOString(),
    });
  }

  async function updateProject(id: number, patch: ProjectPatch): Promise<Project> {
    const updated = await projects.update(id, patch);
    if (!updated) throw new NotFoundError(`No project with id ${id}.`);
    return updated;
  }
  async function listProjects() {
    return projects.findAllWithTaskCount(); // one query for all counts
  }

  async function deleteProject(id: number): Promise<void> {
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

  // Still filters in memory; Day 18 pushes this into SQL
  async function listProjectTasks(id: number, q: Omit<TaskQuery, "projectId">) {
    await getProject(id);
    return applyQuery(await tasks.findAll(), { ...q, projectId: id });
  }

  return { getProject, listProjects, createProject, updateProject, deleteProject,listProjectTasks };
}