import path from "node:path";
import { config } from "./config.js";
import { prisma } from "./db.js";
import { JsonFileRepository } from "./repositories/jsonFileRepository.js";
import { migrateLegacyTask } from "./repositories/legacy.js";
import { PrismaCommentRepository } from "./repositories/prisma/comment.repository.js";
import { PrismaProjectRepository } from "./repositories/prisma/project.repository.js";
import { PrismaTaskRepository } from "./repositories/prisma/task.repository.js";
import type { Repository } from "./repositories/repository.js";
import { createCommentService } from "./services/comments.service.js";
import { createProjectService } from "./services/projects.service.js";
import { createTaskService } from "./services/tasks.service.js";
import {
  commentSchema, projectSchema, taskSchema,
  type Comment, type Project, type Task,
} from "./types.js";

type Repositories = {
  tasks: Repository<Task>;
  projects: Repository<Project>;
  comments: Repository<Comment>;
};

function createRepositories(): Repositories {
  if (config.storage === "json") {
    const dir = path.dirname(config.dataFile);
    return {
      tasks: new JsonFileRepository<Task>(config.dataFile, taskSchema, migrateLegacyTask),
      projects: new JsonFileRepository<Project>(path.join(dir, "projects.json"), projectSchema),
      comments: new JsonFileRepository<Comment>(path.join(dir, "comments.json"), commentSchema),
    };
  }
  return {
    tasks: new PrismaTaskRepository(prisma),
    projects: new PrismaProjectRepository(prisma),
    comments: new PrismaCommentRepository(prisma),
  };
}

const repos = createRepositories();

export const taskService = createTaskService(repos);
export const projectService = createProjectService({ projects: repos.projects, tasks: repos.tasks });
export const commentService = createCommentService({ comments: repos.comments, tasks: repos.tasks });