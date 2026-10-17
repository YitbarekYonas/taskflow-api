import path from "node:path";
import { config } from "./config.js";
import { JsonFileRepository } from "./repositories/jsonFileRepository.js";
import { migrateLegacyTask } from "./repositories/legacy.js";
import { createProjectService } from "./services/projects.service.js";
import { createTaskService } from "./services/tasks.service.js";
import { projectSchema, taskSchema, type Project, type Task } from "./types.js";

const dataDir = path.dirname(config.dataFile);

const taskRepo = new JsonFileRepository<Task>(config.dataFile, taskSchema, migrateLegacyTask);
const projectRepo = new JsonFileRepository<Project>(path.join(dataDir, "projects.json"), projectSchema);

export const taskService = createTaskService({ tasks: taskRepo, projects: projectRepo });
export const projectService = createProjectService({ projects: projectRepo, tasks: taskRepo });