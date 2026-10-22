import { prisma } from "./db.js";
import { PrismaCommentRepository } from "./repositories/prisma/comment.repository.js";
import { PrismaProjectRepository } from "./repositories/prisma/project.repository.js";
import { PrismaTaskRepository } from "./repositories/prisma/task.repository.js";
import { createCommentService } from "./services/comments.service.js";
import { createProjectService } from "./services/projects.service.js";
import { createTaskService } from "./services/tasks.service.js";

const tasks = new PrismaTaskRepository(prisma);
const projects = new PrismaProjectRepository(prisma);
const comments = new PrismaCommentRepository(prisma);

export const taskService = createTaskService({ tasks });
export const projectService = createProjectService({ projects, tasks });
export const commentService = createCommentService({ comments, tasks });