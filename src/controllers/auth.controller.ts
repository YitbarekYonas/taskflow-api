import type { Request, Response } from "express";
import { authService } from "../container.js";
import type { RegisterInput } from "../schemas/auth.schemas.js";

export async function register(_req: Request, res: Response) {
  const user = await authService.register(res.locals.body as RegisterInput);
  res.status(201).json({ data: user });
}