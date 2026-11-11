import type { Request, Response } from "express";
import { actorOf } from "../middleware/authenticate.js";
import { projectService } from "../container.js";
import type {
  NewProject,
  ProjectPatch,
  MergeProject,
  DuplicateProject,
  ChangeRole,
  AddMember,
} from "../schemas/project.schemas.js";
import type { TaskQuery } from "../schemas/task.schemas.js";

export async function listTasks(_req: Request, res: Response) {
  const { id } = res.locals.params as { id: number };
  const { items, meta } = await projectService.listProjectTasks(
    id,
    res.locals.query as Omit<TaskQuery, "projectId">,
    actorOf(res),
  );
  res.json({ data: items, meta });
}

export async function list(_req: Request, res: Response) {
  res.json({ data: await projectService.listProjects(actorOf(res)) });
}

export async function getById(_req: Request, res: Response) {
  const { id } = res.locals.params as { id: number };
  res.json({ data: await projectService.getProject(id, actorOf(res)) });
}

export async function create(_req: Request, res: Response) {
  const project = await projectService.createProject(res.locals.body as NewProject, actorOf(res));
  res.status(201).location(`/projects/${project.id}`).json({ data: project });
}

export async function update(_req: Request, res: Response) {
  const { id } = res.locals.params as { id: number };
  res.json({
    data: await projectService.updateProject(id, res.locals.body as ProjectPatch, actorOf(res)),
  });
}

export async function remove(_req: Request, res: Response) {
  const { id } = res.locals.params as { id: number };
  await projectService.deleteProject(id, actorOf(res));
  res.status(204).end();
}

export async function duplicate(_req: Request, res: Response) {
  const { id } = res.locals.params as { id: number };
  const result = await projectService.duplicateProject(
    id,
    res.locals.body as DuplicateProject,
    actorOf(res),
  );
  res.status(201).location(`/projects/${result.project.id}`).json({ data: result });
}

export async function merge(_req: Request, res: Response) {
  const { id } = res.locals.params as { id: number };
  const { intoProjectId } = res.locals.body as MergeProject;
  res.json({ data: await projectService.mergeProjects(id, intoProjectId, actorOf(res)) });
}
export async function listMembers(_req: Request, res: Response) {
  const { id } = res.locals.params as { id: number };
  res.json({ data: await projectService.listMembers(id, actorOf(res)) });
}

export async function addMember(_req: Request, res: Response) {
  const { id } = res.locals.params as { id: number };
  const member = await projectService.addMember(id, res.locals.body as AddMember, actorOf(res));
  res.status(201).json({ data: member });
}

export async function changeRole(_req: Request, res: Response) {
  const { id, userId } = res.locals.params as { id: number; userId: number };
  const { role } = res.locals.body as ChangeRole;
  res.json({ data: await projectService.changeRole(id, userId, role, actorOf(res)) });
}

export async function removeMember(_req: Request, res: Response) {
  const { id, userId } = res.locals.params as { id: number; userId: number };
  await projectService.removeMember(id, userId, actorOf(res));
  res.status(204).end();
}
