import { Router } from "express";
import { register } from "../controllers/auth.controller.js";
import { validate } from "../middleware/validate.js";
import { registerSchema } from "../schemas/auth.schemas.js";

export const authRouter = Router();

authRouter.post("/register", validate({ body: registerSchema }), register);