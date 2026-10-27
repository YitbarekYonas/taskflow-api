import { hashPassword } from "../auth/password.js";
import type { UserRepository } from "../repositories/userRepository.js";
import type { RegisterInput } from "../schemas/auth.schemas.js";
import type { User } from "../types.js";

export function createAuthService({ users }: { users: UserRepository }) {
  async function register(input: RegisterInput): Promise<User> {
    const passwordHash = await hashPassword(input.password);
    return users.create({ email: input.email, name: input.name, passwordHash });
  }

  return { register };
}

export type AuthService = ReturnType<typeof createAuthService>;