import type { Request, Response } from "express";
import { commentService } from "../container.js";
import type { CommentPatch, NewComment } from "../schemas/comment.schemas.js";
import { actorOf } from "../middleware/authenticate.js";

type Params = { taskId: number; commentId: number };

export async function list(_req: Request, res: Response) {
  const { taskId } = res.locals.params as Params;
  res.json({ data: await commentService.listComments(taskId, actorOf(res)) });
}

export async function getById(_req: Request, res: Response) {
  const { taskId, commentId } = res.locals.params as Params;
  res.json({ data: await commentService.getComment(taskId, commentId, actorOf(res)) });
}

export async function create(_req: Request, res: Response) {
  const { taskId } = res.locals.params as Params;
  const comment = await commentService.addComment(
    taskId,
    res.locals.body as NewComment,
    actorOf(res),
  );
  res.status(201).location(`/tasks/${taskId}/comments/${comment.id}`).json({ data: comment });
}

export async function update(_req: Request, res: Response) {
  const { taskId, commentId } = res.locals.params as Params;
  const comment = await commentService.updateComment(
    taskId,
    commentId,
    res.locals.body as CommentPatch,
    actorOf(res),
  );
  res.json({ data: comment });
}

export async function remove(_req: Request, res: Response) {
  const { taskId, commentId } = res.locals.params as Params;
  await commentService.deleteComment(taskId, commentId, actorOf(res));
  res.status(204).end();
}
