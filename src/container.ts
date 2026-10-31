import { prisma } from "./db.js";
import { PrismaCommentRepository } from "./repositories/prisma/comment.repository.js";
import { PrismaProjectRepository } from "./repositories/prisma/project.repository.js";
import { PrismaTaskRepository } from "./repositories/prisma/task.repository.js";
import { createCommentService } from "./services/comments.service.js";
import { createProjectService } from "./services/projects.service.js";
import { createTaskService } from "./services/tasks.service.js";
import { PrismaUnitOfWork } from "./repositories/prisma/unitOfWork.js";
import { PrismaUserRepository } from "./repositories/prisma/user.repository.js";
import { createAuthService } from "./services/auth.service.js";
import { PrismaRefreshTokenRepository } from "./repositories/prisma/refreshToken.repository.js";

const tasks = new PrismaTaskRepository(prisma);
const projects = new PrismaProjectRepository(prisma);
const comments = new PrismaCommentRepository(prisma);
const uow = new PrismaUnitOfWork(prisma);
const users = new PrismaUserRepository(prisma);
const refreshTokens = new PrismaRefreshTokenRepository(prisma);

export const authService = createAuthService({ users, refreshTokens });
export const projectService = createProjectService({ projects, tasks, uow });
export const taskService = createTaskService({ tasks });
export const commentService = createCommentService({ comments, tasks });