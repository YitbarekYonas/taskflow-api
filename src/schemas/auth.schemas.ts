import { z } from "zod";
import { noNul, NO_NUL_MESSAGE } from "./common.schemas.js";

export const registerSchema = z
  .object({
    email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
    name: z.string().trim().min(1, "Name cannot be empty").max(100).refine(noNul, NO_NUL_MESSAGE),
    password: z.string().min(10, "Use at least 10 characters").max(128),
  })
  .strict();
  
export const loginSchema = z
  .object({
    email: z.string().trim().toLowerCase().min(1).max(254),
    password: z.string().min(1).max(128),
  })
  .strict();

export const refreshSchema = z
  .object({ refreshToken: z.string().min(20).max(200) })
  .strict();

export type RefreshInput = z.infer<typeof refreshSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;