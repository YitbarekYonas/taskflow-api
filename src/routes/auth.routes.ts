import { Router } from "express";
import { login, logout, logoutAll, me, refresh, register } from "../controllers/auth.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { validate } from "../middleware/validate.js";
import { loginSchema, refreshSchema, registerSchema } from "../schemas/auth.schemas.js";
import {
  loginAccountLimiter,
  loginIpLimiter,
  refreshLimiter,
  registerLimiter,
} from "../middleware/limiters.js";

export const authRouter = Router();

authRouter.use((_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});

authRouter.post("/register", registerLimiter, validate({ body: registerSchema }), register);

authRouter.post(
  "/login",
  loginIpLimiter,
  loginAccountLimiter,
  validate({ body: loginSchema }),
  login,
);

authRouter.post("/refresh", refreshLimiter, validate({ body: refreshSchema }), refresh);

authRouter.post("/logout", refreshLimiter, validate({ body: refreshSchema }), logout);

authRouter.post("/logout-all", authenticate, logoutAll);
authRouter.get("/me", authenticate, me);
