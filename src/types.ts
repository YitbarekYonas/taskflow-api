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
  projectId: z.number().int().positive().optional(),
});

export const commentSchema = z.object({
  id: z.number().int().positive(),
  taskId: z.number().int().positive(),
  author: z.string().min(1),
  body: z.string().min(1),
  createdAt: z.string(),
  updatedAt: z.string().optional(),
});
export type Comment = z.infer<typeof commentSchema>;

export type Task = z.infer<typeof taskSchema>;


export type NewTask = Pick<Task, "title"> &
  Partial<Pick<Task, "priority" | "dueDate" | "projectId">>;

export const projectSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  description: z.string().optional(),
  createdAt: z.string(),
});
export type Project = z.infer<typeof projectSchema>;