import { z } from "zod";

export const STATUSES = ["todo", "in_progress", "done"] as const;
export const PRIORITIES = ["low", "medium", "high"] as const;

export type Status = (typeof STATUSES)[number];
export type Priority = (typeof PRIORITIES)[number];

export const taskSchema = z.object({
  id: z.number().int().positive(),
  title: z.string().min(1),
  status: z.enum(STATUSES),
  priority: z.enum(PRIORITIES),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  createdAt: z.string(),
});


export type Task = z.infer<typeof taskSchema>;


export type NewTask = Pick<Task, "title"> & Partial<Pick<Task, "priority" | "dueDate">>;