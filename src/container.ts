import { config } from "./config.js";
import { JsonFileRepository } from "./repositories/jsonFileRepository.js";
import { migrateLegacyTask } from "./repositories/legacy.js";
import { createTaskService } from "./services/tasks.service.js";
import { taskSchema, type Task } from "./types.js";

const taskRepo = new JsonFileRepository<Task>(config.dataFile, taskSchema, migrateLegacyTask);

export const taskService = createTaskService({ tasks: taskRepo });