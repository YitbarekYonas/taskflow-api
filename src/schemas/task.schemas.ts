import { z } from "zod";
import { PRIORITIES, STATUSES } from "../types.js";

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .refine((v) => !Number.isNaN(Date.parse(v)), "Not a real date");

const title = z.string().trim().min(1, "Title cannot be empty").max(200);

export const createTaskSchema = z
  .object({
    title,
    priority: z.enum(PRIORITIES).optional(),
    dueDate: dateString.optional(),
  })
  .strict();


export const updateTaskSchema = z
  .object({
    title,
    status: z.enum(STATUSES),
    priority: z.enum(PRIORITIES),
    dueDate: dateString.nullable(),
  })
  .partial()
  .strict()
  .refine((body) => Object.keys(body).length > 0, {
    message: "Provide at least one field to update",
  });

export type TaskPatch = z.infer<typeof updateTaskSchema>;