import { z } from "zod";

export const registerSchema = z
  .object({
    email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
    name: z.string().trim().min(1, "Name cannot be empty").max(100),
    password: z.string().min(10, "Use at least 10 characters").max(128),
  })
  .strict();
  
export const loginSchema = z
  .object({
    email: z.string().trim().toLowerCase().min(1).max(254),
    password: z.string().min(1).max(128),
  })
  .strict();

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;