import path from "node:path";
import { config } from "./config.js";
import { JsonFileRepository } from "./repositories/jsonFileRepository.js";
import { migrateLegacyTask } from "./repositories/legacy.js";
import { createProjectService } from "./services/projects.service.js";
import { createTaskService } from "./services/tasks.service.js";
import { createCommentService } from "./services/comments.service.js";
import { 
  commentSchema, 
  projectSchema, 
  taskSchema, 
  type Comment, 
  type Project, 
  type Task 
} from "./types.js";

const dataDir = path.dirname(config.dataFile);

const taskRepo = new JsonFileRepository<Task>(config.dataFile, taskSchema, migrateLegacyTask);
const projectRepo = new JsonFileRepository<Project>(path.join(dataDir, "projects.json"), projectSchema);
const commentRepo = new JsonFileRepository<Comment>(path.join(dataDir, "comments.json"), commentSchema);

export const taskService = createTaskService({
  tasks: taskRepo,
  projects: projectRepo,
  comments: commentRepo,
});

export const projectService = createProjectService({ 
  projects: projectRepo, 
  tasks: taskRepo 
});

export const commentService = createCommentService({ 
  comments: commentRepo, 
  tasks: taskRepo 
});