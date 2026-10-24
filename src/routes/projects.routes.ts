import { Router } from "express";
import { create, getById, list, remove, update } from "../controllers/projects.controller.js";
import { validate } from "../middleware/validate.js";
import { idParamSchema } from "../schemas/common.schemas.js";
import { createProjectSchema, updateProjectSchema } from "../schemas/project.schemas.js";
import { listTasks } from "../controllers/projects.controller.js";
import { listTasksQuerySchema } from "../schemas/task.schemas.js";
import { duplicate, merge } from "../controllers/projects.controller.js";
import { duplicateProjectSchema, mergeProjectSchema } from "../schemas/project.schemas.js";
export const projectsRouter = Router();

projectsRouter.get(
  "/:id/tasks",
  validate({ params: idParamSchema, query: listTasksQuerySchema.omit({ projectId: true }) }),
  listTasks
);

projectsRouter.post(
  "/:id/duplicate",
  validate({ params: idParamSchema, body: duplicateProjectSchema }),
  duplicate
);
projectsRouter.post(
  "/:id/merge",
  validate({ params: idParamSchema, body: mergeProjectSchema }),
  merge
);
projectsRouter.get("/", list);
projectsRouter.post("/", validate({ body: createProjectSchema }), create);
projectsRouter.get("/:id", validate({ params: idParamSchema }), getById);
projectsRouter.patch("/:id", validate({ params: idParamSchema, body: updateProjectSchema }), update);
projectsRouter.delete("/:id", validate({ params: idParamSchema }), remove);