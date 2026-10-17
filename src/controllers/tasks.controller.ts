import type { Request, Response } from "express";
import { taskService } from "../container.js";
import type { TaskPatch, TaskQuery } from "../schemas/task.schemas.js";
import type { NewTask } from "../types.js";

export async function list(_req: Request, res: Response) {
  const { items, meta } = await taskService.queryTasks(res.locals.query as TaskQuery);
  res.json({ data: items, meta });
}

export async function getById(_req: Request, res: Response) {
  const { id } = res.locals.params as { id: number };
  res.json({ data: await taskService.getTask(id) });
}

export async function create(_req: Request, res: Response) {
  const task = await taskService.addTask(res.locals.body as NewTask);
  res.status(201).location(`/tasks/${task.id}`).json({ data: task });
}

export async function update(_req: Request, res: Response) {
  const { id } = res.locals.params as { id: number };
  res.json({ data: await taskService.updateTask(id, res.locals.body as TaskPatch) });
}

export async function remove(_req: Request, res: Response) {
  const { id } = res.locals.params as { id: number };
  await taskService.deleteTask(id);
  res.status(204).end();
}