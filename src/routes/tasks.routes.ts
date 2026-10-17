import { Router } from "express";
import { create, getById, list, remove, update } from "../controllers/tasks.controller.js";

export const tasksRouter = Router();

tasksRouter.get("/", list);
tasksRouter.post("/", create);
tasksRouter.get("/:id", getById);
tasksRouter.patch("/:id", update);
tasksRouter.delete("/:id", remove);