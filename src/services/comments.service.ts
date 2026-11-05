import { createAccess } from "../auth/access.js";
import type { Actor } from "../auth/policy.js";
import {
  ForbiddenError, InvalidReferenceError, NotFoundError, UnauthorizedError,
} from "../errors.js";
import type { MemberRepository } from "../repositories/memberRepository.js";
import type { Repository } from "../repositories/repository.js";
import type { UserRepository } from "../repositories/userRepository.js";
import type { CommentPatch, NewComment } from "../schemas/comment.schemas.js";
import type { Comment, Task } from "../types.js";

type Deps = {
  comments: Repository<Comment>;
  tasks: Repository<Task>;
  members: MemberRepository;
  users: UserRepository;
};

const isAuthor = (comment: Comment, actor: Actor) =>
  actor.kind === "user" && comment.authorId === actor.id;

export function createCommentService({ comments, tasks, members, users }: Deps) {
  const access = createAccess(members);

  // Comments inherit the visibility of their task: no access to the task, no comments
  async function loadTask(taskId: number, actor: Actor) {
    const task = await tasks.findById(taskId);
    if (!task) throw new NotFoundError(`No task with id ${taskId}.`);
    const role = await access.requireTaskRole(actor, task, "member");
    return { task, role };
  }

  async function loadComment(taskId: number, commentId: number, actor: Actor) {
    const { role } = await loadTask(taskId, actor);
    const comment = await comments.findById(commentId);
    if (!comment || comment.taskId !== taskId) {
      throw new NotFoundError(`No comment ${commentId} on task ${taskId}.`);
    }
    return { comment, role };
  }

  async function getComment(taskId: number, commentId: number, actor: Actor): Promise<Comment> {
    return (await loadComment(taskId, commentId, actor)).comment;
  }

  async function listComments(taskId: number, actor: Actor): Promise<Comment[]> {
    await loadTask(taskId, actor);
    return (await comments.findAll()).filter((c) => c.taskId === taskId);
  }

  async function addComment(taskId: number, input: NewComment, actor: Actor): Promise<Comment> {
    if (actor.kind !== "user") throw new ForbiddenError("Only logged-in users can comment.");
    await loadTask(taskId, actor);

    // Identity comes from the token, never from the request body
    const author = await users.findById(actor.id);
    if (!author) throw new UnauthorizedError("Invalid or expired token.");

    try {
      return await comments.insert({
        taskId,
        author: author.name, // a snapshot for display; authorId is the real link
        authorId: author.id,
        body: input.body,
        createdAt: new Date().toISOString(),
      });
    } catch (err) {
      if (err instanceof InvalidReferenceError) throw new NotFoundError(`No task with id ${taskId}.`);
      throw err;
    }
  }

  async function updateComment(
    taskId: number, commentId: number, patch: CommentPatch, actor: Actor
  ): Promise<Comment> {
    const { comment } = await loadComment(taskId, commentId, actor);
    if (!isAuthor(comment, actor)) throw new ForbiddenError("Only the author can edit a comment.");
    const updated = await comments.update(commentId, {
      body: patch.body,
      updatedAt: new Date().toISOString(),
    });
    if (!updated) throw new NotFoundError(`No comment ${commentId} on task ${taskId}.`);
    return updated;
  }

  async function deleteComment(taskId: number, commentId: number, actor: Actor): Promise<void> {
    const { comment, role } = await loadComment(taskId, commentId, actor);
    if (role !== "owner" && !isAuthor(comment, actor)) {
      throw new ForbiddenError("Only the author or a project owner can delete a comment.");
    }
    await comments.remove(commentId);
  }

  return { getComment, listComments, addComment, updateComment, deleteComment };
}