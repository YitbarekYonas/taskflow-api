import type { Request, Response } from "express";
import { addTask, deleteTask, getTask, queryTasks, updateTask } from "../commands.js";
import type { TaskPatch } from "../schemas/task.schemas.js";
import type { TaskQuery } from "../schemas/task.schemas.js";
import type { NewTask } from "../types.js";

export async function list(_req: Request, res: Response) {
  const { items, meta } = await queryTasks(res.locals.query as TaskQuery);
  res.json({ data: items, meta });
}

export async function getById(_req: Request, res: Response) {
  const { id } = res.locals.params as { id: number };
  res.json({ data: await getTask(id) });
}

export async function create(_req: Request, res: Response) {
  const task = await addTask(res.locals.body as NewTask);
  res.status(201).location(`/tasks/${task.id}`).json({ data: task });
}

export async function update(_req: Request, res: Response) {
  const { id } = res.locals.params as { id: number };
  const task = await updateTask(id, res.locals.body as TaskPatch);
  res.json({ data: task });
}

export async function remove(_req: Request, res: Response) {
  const { id } = res.locals.params as { id: number };
  await deleteTask(id);
  res.status(204).end();
}