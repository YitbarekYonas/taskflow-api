import { z } from "zod";
import { ROLES } from "../types.js";

export const createProjectSchema = z
  .object({
    name: z.string().trim().min(1, "Name cannot be empty").max(100),
    description: z.string().trim().max(500).optional(),
  })
  .strict();

export const updateProjectSchema = createProjectSchema
  .partial()
  .strict()
  .refine((body) => Object.keys(body).length > 0, {
    message: "Provide at least one field to update",
  });

  // The body is optional: POST /projects/1/duplicate with no body is fine
export const duplicateProjectSchema = z
  .object({ name: z.string().trim().min(1).max(100).optional() })
  .strict()
  .default({});

export const mergeProjectSchema = z
  .object({ intoProjectId: z.number().int().positive() })
  .strict();
export const addMemberSchema = z
  .object({
    email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
    role: z.enum(ROLES).default("member"),
  })
  .strict();

export const changeRoleSchema = z.object({ role: z.enum(ROLES) }).strict();

export type AddMember = z.infer<typeof addMemberSchema>;
export type ChangeRole = z.infer<typeof changeRoleSchema>;
export type DuplicateProject = z.infer<typeof duplicateProjectSchema>;
export type MergeProject = z.infer<typeof mergeProjectSchema>;
export type NewProject = z.infer<typeof createProjectSchema>;
export type ProjectPatch = z.infer<typeof updateProjectSchema>;