import { z } from "zod";
import { noNul, NO_NUL_MESSAGE } from "./common.schemas.js";

const body = z.string().trim().min(1, "Comment cannot be empty").max(2000);

export const createCommentSchema = z
  .object({
    body: z.string().trim().min(1).max(2000).refine(noNul, NO_NUL_MESSAGE),
  })
  .strict();


export const updateCommentSchema = z.object({ body }).strict();

export type NewComment = z.infer<typeof createCommentSchema>;
export type CommentPatch = z.infer<typeof updateCommentSchema>;