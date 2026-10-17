import { ConflictError, NotFoundError } from "../errors.js";
import type { Repository } from "../repositories/repository.js";
import type { NewProject, ProjectPatch } from "../schemas/project.schemas.js";
import type { Project, Task } from "../types.js";

type Deps = { projects: Repository<Project>; tasks: Repository<Task> };

export function createProjectService({ projects, tasks }: Deps) {
  async function getProject(id: number): Promise<Project> {
    const project = await projects.findById(id);
    if (!project) throw new NotFoundError(`No project with id ${id}.`);
    return project;
  }

  async function listProjects(): Promise<Project[]> {
    return projects.findAll();
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

  async function deleteProject(id: number): Promise<void> {
    await getProject(id);
    const count = (await tasks.findAll()).filter((t) => t.projectId === id).length;
    if (count > 0) {
      throw new ConflictError(`Project ${id} still has ${count} task(s). Move or delete them first.`);
    }
    await projects.remove(id);
  }

  return { getProject, listProjects, createProject, updateProject, deleteProject };
}