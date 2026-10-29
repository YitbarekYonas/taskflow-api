import { z } from "zod";

export const registerSchema = z
  .object({
    email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
    name: z.string().trim().min(1, "Name cannot be empty").max(100),
    password: z.string().min(10, "Use at least 10 characters").max(128),
  })
  .strict();

export type RegisterInput = z.infer<typeof registerSchema>;