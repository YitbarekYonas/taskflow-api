import { z } from "zod";
import { PRIORITIES, STATUSES } from "../types.js";

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .refine((v) => !Number.isNaN(Date.parse(v)), "Not a real date");

const title = z.string().trim().min(1, "Title cannot be empty").max(200);

export const SORT_FIELDS = ["createdAt", "dueDate", "priority", "title"] as const;

export const listTasksQuerySchema = z.object({
  status: z.enum(STATUSES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  search: z.string().trim().min(1).optional(),
  sort: z.enum(SORT_FIELDS).default("createdAt"),
  order: z.enum(["asc", "desc"]).default("asc"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  projectId: z.coerce.number().int().positive().optional(),
});

export type TaskQuery = z.infer<typeof listTasksQuerySchema>;
export const createTaskSchema = z
  .object({
    title,
    priority: z.enum(PRIORITIES).optional(),
    dueDate: dateString.optional(),
    projectId: z.number().int().positive().optional(),
  })
  .strict();


export const updateTaskSchema = z
  .object({
    title,
    status: z.enum(STATUSES),
    priority: z.enum(PRIORITIES),
    dueDate: dateString.nullable(),
    projectId: z.number().int().positive().nullable(),
  })
  .partial()
  .strict()
  .refine((body) => Object.keys(body).length > 0, {
    message: "Provide at least one field to update",
  });

export type TaskPatch = z.infer<typeof updateTaskSchema>;