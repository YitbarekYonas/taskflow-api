import { z } from "zod";

const body = z.string().trim().min(1, "Comment cannot be empty").max(2000);

export const createCommentSchema = z
  .object({
    body,
  })
  .strict();


export const updateCommentSchema = z.object({ body }).strict();

export type NewComment = z.infer<typeof createCommentSchema>;
export type CommentPatch = z.infer<typeof updateCommentSchema>;