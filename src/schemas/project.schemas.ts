import { z } from "zod";

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

export type NewProject = z.infer<typeof createProjectSchema>;
export type ProjectPatch = z.infer<typeof updateProjectSchema>;