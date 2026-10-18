import { z } from "zod";

export const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});
export const taskIdParamSchema = z.object({
  taskId: z.coerce.number().int().positive(),
});

export const commentParamsSchema = taskIdParamSchema.extend({
  commentId: z.coerce.number().int().positive(),
});