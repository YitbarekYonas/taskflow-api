import { NotFoundError } from "../errors.js";
import type { Repository } from "../repositories/repository.js";
import type { CommentPatch, NewComment } from "../schemas/comment.schemas.js";
import type { Comment, Task } from "../types.js";

type Deps = { comments: Repository<Comment>; tasks: Repository<Task> };

export function createCommentService({ comments, tasks }: Deps) {
 
  async function assertTaskExists(taskId: number) {
    if (!(await tasks.findById(taskId))) {
      throw new NotFoundError(`No task with id ${taskId}.`);
    }
  }


  async function getOwnedComment(taskId: number, commentId: number): Promise<Comment> {
    await assertTaskExists(taskId);
    const comment = await comments.findById(commentId);
    if (!comment || comment.taskId !== taskId) {
      throw new NotFoundError(`No comment ${commentId} on task ${taskId}.`);
    }
    return comment;
  }

  async function listComments(taskId: number): Promise<Comment[]> {
    await assertTaskExists(taskId);
    return (await comments.findAll()).filter((c) => c.taskId === taskId);
  }

  async function addComment(taskId: number, input: NewComment): Promise<Comment> {
    await assertTaskExists(taskId);
    return comments.insert({
      taskId,
      author: input.author,
      body: input.body,
      createdAt: new Date().toISOString(),
    });
  }

  async function updateComment(
    taskId: number,
    commentId: number,
    patch: CommentPatch
  ): Promise<Comment> {
    await getOwnedComment(taskId, commentId);
    const updated = await comments.update(commentId, {
      body: patch.body,
      updatedAt: new Date().toISOString(),
    });
    if (!updated) throw new NotFoundError(`No comment ${commentId} on task ${taskId}.`);
    return updated;
  }

  async function deleteComment(taskId: number, commentId: number): Promise<void> {
    await getOwnedComment(taskId, commentId);
    await comments.remove(commentId);
  }

  return { getOwnedComment, listComments, addComment, updateComment, deleteComment };
}