import type { Request, Response } from "express";
import { z } from "zod";
import { getTask, listTasks } from "../commands.js";
import { STATUSES } from "../types.js";

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