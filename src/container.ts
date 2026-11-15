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
import { PrismaMemberRepository } from "./repositories/prisma/member.repository.js";
import { createCache } from "./cache/cache.js";
import { redis } from "./redis.js";
import { createStatsService } from "./services/stats.service.js";

const tasks = new PrismaTaskRepository(prisma);
const projects = new PrismaProjectRepository(prisma);
const comments = new PrismaCommentRepository(prisma);
const uow = new PrismaUnitOfWork(prisma);
const users = new PrismaUserRepository(prisma);
const refreshTokens = new PrismaRefreshTokenRepository(prisma);
const members = new PrismaMemberRepository(prisma);

const cache = createCache(redis);
const stats = createStatsService({ tasks, members, cache });

export const statsService = stats;
export const authService = createAuthService({ users, refreshTokens });
export const taskService = createTaskService({ tasks, members, stats });
export const projectService = createProjectService({ projects, tasks, members, uow, stats });
export const commentService = createCommentService({ comments, tasks, members, users });
