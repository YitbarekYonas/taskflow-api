import type { Request, Response } from "express";
import { authService } from "../container.js";
import { currentUser } from "../middleware/authenticate.js";
import type { LoginInput, RegisterInput,RefreshInput } from "../schemas/auth.schemas.js";

export async function login(_req: Request, res: Response) {
  res.json({ data: await authService.login(res.locals.body as LoginInput) });
}

export async function me(_req: Request, res: Response) {
  res.json({ data: currentUser(res) });
}
export async function register(_req: Request, res: Response) {
  const user = await authService.register(res.locals.body as RegisterInput);
  res.status(201).json({ data: user });
}
export async function refresh(_req: Request, res: Response) {
  const { refreshToken } = res.locals.body as RefreshInput;
  res.json({ data: await authService.refresh(refreshToken) });
}

export async function logout(_req: Request, res: Response) {
  const { refreshToken } = res.locals.body as RefreshInput;
  await authService.logout(refreshToken);
  res.status(204).end();
}

export async function logoutAll(_req: Request, res: Response) {
  await authService.logoutAll(currentUser(res).id);
  res.status(204).end();
}