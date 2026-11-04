import { z } from "zod";
import { PRIORITIES, STATUSES } from "../types.js";
import { dbId, dbIdBody, noNul, NO_NUL_MESSAGE } from "./common.schemas.js";

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .refine((v) => !Number.isNaN(Date.parse(v)), "Not a real date");

const title = z.string().trim().min(1, "Title cannot be empty").max(200);

export const SORT_FIELDS = ["createdAt", "dueDate", "priority", "title"] as const;

export const listTasksQuerySchema = z.object({
  status: z.enum(STATUSES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  search: z.string().trim().min(1).max(200).refine(noNul, NO_NUL_MESSAGE).optional(),
  sort: z.enum(SORT_FIELDS).default("createdAt"),
  order: z.enum(["asc", "desc"]).default("asc"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  projectId: dbId.optional(),
});

export type TaskQuery = z.infer<typeof listTasksQuerySchema>;
export const createTaskSchema = z
  .object({
    title: z.string().trim().min(1).max(200).refine(noNul, NO_NUL_MESSAGE),
    priority: z.enum(PRIORITIES).optional(),
    dueDate: dateString.optional(),
    projectId: dbIdBody.optional(),
  })
  .strict();


export const updateTaskSchema = z
  .object({
    title: z.string().trim().min(1).max(200).refine(noNul, NO_NUL_MESSAGE),
    status: z.enum(STATUSES),
    priority: z.enum(PRIORITIES),
    dueDate: dateString.nullable(),
    projectId: dbIdBody.nullable(),
  })
  .partial()
  .strict()
  .refine((body) => Object.keys(body).length > 0, {
    message: "Provide at least one field to update",
  });

export type TaskPatch = z.infer<typeof updateTaskSchema>;