import type { Request, Response } from "express";
import { projectService } from "../container.js";
import type { NewProject, ProjectPatch } from "../schemas/project.schemas.js";

export async function list(_req: Request, res: Response) {
  res.json({ data: await projectService.listProjects() });
}

export async function getById(_req: Request, res: Response) {
  const { id } = res.locals.params as { id: number };
  res.json({ data: await projectService.getProject(id) });
}

export async function create(_req: Request, res: Response) {
  const project = await projectService.createProject(res.locals.body as NewProject);
  res.status(201).location(`/projects/${project.id}`).json({ data: project });
}

export async function update(_req: Request, res: Response) {
  const { id } = res.locals.params as { id: number };
  res.json({ data: await projectService.updateProject(id, res.locals.body as ProjectPatch) });
}

export async function remove(_req: Request, res: Response) {
  const { id } = res.locals.params as { id: number };
  await projectService.deleteProject(id);
  res.status(204).end();
}