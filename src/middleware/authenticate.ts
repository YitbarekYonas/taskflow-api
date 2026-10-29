import type { RequestHandler, Response } from "express";
import { authService } from "../container.js";
import { UnauthorizedError } from "../errors.js";
import type { User } from "../types.js";

export const authenticate: RequestHandler = async (req, res, next) => {
  const match = req.header("authorization")?.match(/^Bearer\s+(\S+)$/i);
  if (!match) throw new UnauthorizedError("Authentication required.");

  res.locals.user = await authService.authenticate(match[1]);
  next();
};

export function currentUser(res: Response): User {
  return res.locals.user as User;
}