import { Router } from "express";
import { getById, list } from "../controllers/tasks.controller.js";

export const tasksRouter = Router();

tasksRouter.get("/", list);
tasksRouter.get("/:id", getById);