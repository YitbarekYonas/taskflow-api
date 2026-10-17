import { Router } from "express";
import { create, getById, list, remove, update } from "../controllers/projects.controller.js";
import { validate } from "../middleware/validate.js";
import { idParamSchema } from "../schemas/common.schemas.js";
import { createProjectSchema, updateProjectSchema } from "../schemas/project.schemas.js";

export const projectsRouter = Router();

projectsRouter.get("/", list);
projectsRouter.post("/", validate({ body: createProjectSchema }), create);
projectsRouter.get("/:id", validate({ params: idParamSchema }), getById);
projectsRouter.patch("/:id", validate({ params: idParamSchema, body: updateProjectSchema }), update);
projectsRouter.delete("/:id", validate({ params: idParamSchema }), remove);