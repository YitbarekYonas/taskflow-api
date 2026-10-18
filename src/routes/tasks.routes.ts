import { Router } from "express";
import { create, getById, list, remove, update } from "../controllers/tasks.controller.js";
import { validate } from "../middleware/validate.js";
import { idParamSchema } from "../schemas/common.schemas.js";
import {
  createTaskSchema,
  listTasksQuerySchema,
  updateTaskSchema,
} from "../schemas/task.schemas.js";
import { commentsRouter } from "./comments.routes.js";

export const tasksRouter = Router();
tasksRouter.use("/:taskId/comments", commentsRouter);
tasksRouter.get("/", validate({ query: listTasksQuerySchema }), list);
tasksRouter.post("/", validate({ body: createTaskSchema }), create);
tasksRouter.get("/:id", validate({ params: idParamSchema }), getById);
tasksRouter.patch("/:id", validate({ params: idParamSchema, body: updateTaskSchema }), update);
tasksRouter.delete("/:id", validate({ params: idParamSchema }), remove);