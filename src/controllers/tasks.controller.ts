import type { Request, Response } from "express";
import { z } from "zod";
import { STATUSES } from "../types.js";
import { addTask, deleteTask, getTask, listTasks, updateTask } from "../commands.js";
import { createTaskSchema, updateTaskSchema } from "../schemas/task.schemas.js";

const listQuery = z.object({ status: z.enum(STATUSES).optional() });
const idParam = z.coerce.number().int().positive();

export async function list(req: Request, res: Response) {
  const { status } = listQuery.parse(req.query);
  const tasks = await listTasks({ status });
  res.json({ data: tasks });
}

export async function getById(req: Request, res: Response) {
  const id = idParam.parse(req.params.id);
  const task = await getTask(id);
  res.json({ data: task });
}
export async function create(req: Request, res: Response) {
  const body = createTaskSchema.parse(req.body);
  const task = await addTask(body);
  res.status(201).location(`/tasks/${task.id}`).json({ data: task });
}

export async function update(req: Request, res: Response) {
  const id = idParam.parse(req.params.id);
  const patch = updateTaskSchema.parse(req.body);
  const task = await updateTask(id, patch);
  res.json({ data: task });
}

export async function remove(req: Request, res: Response) {
  const id = idParam.parse(req.params.id);
  await deleteTask(id);
  res.status(204).end();
}