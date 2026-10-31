import { Router } from "express";
import { login, logout, logoutAll, me, refresh, register } from "../controllers/auth.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { validate } from "../middleware/validate.js";
import { loginSchema, refreshSchema, registerSchema } from "../schemas/auth.schemas.js";

export const authRouter = Router();

authRouter.use((_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});

authRouter.post("/refresh", validate({ body: refreshSchema }), refresh);
authRouter.post("/logout", validate({ body: refreshSchema }), logout);
authRouter.post("/logout-all", authenticate, logoutAll);
authRouter.post("/register", validate({ body: registerSchema }), register);
authRouter.post("/login", validate({ body: loginSchema }), login);
authRouter.get("/me", authenticate, me);