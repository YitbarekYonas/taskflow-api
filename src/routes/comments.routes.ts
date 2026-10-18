import { Router } from "express";
import { create, getById, list, remove, update } from "../controllers/comments.controller.js";
import { validate } from "../middleware/validate.js";
import { commentParamsSchema, taskIdParamSchema } from "../schemas/common.schemas.js";
import { createCommentSchema, updateCommentSchema } from "../schemas/comment.schemas.js";

export const commentsRouter = Router({ mergeParams: true });

commentsRouter.get("/", validate({ params: taskIdParamSchema }), list);
commentsRouter.post(
  "/",
  validate({ params: taskIdParamSchema, body: createCommentSchema }),
  create
);
commentsRouter.get("/:commentId", validate({ params: commentParamsSchema }), getById);
commentsRouter.patch(
  "/:commentId",
  validate({ params: commentParamsSchema, body: updateCommentSchema }),
  update
);
commentsRouter.delete("/:commentId", validate({ params: commentParamsSchema }), remove);