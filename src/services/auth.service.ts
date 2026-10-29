import { hashPassword, verifyPassword } from "../auth/password.js";
import { signAccessToken, verifyAccessToken } from "../auth/tokens.js";
import { config } from "../config.js";
import { UnauthorizedError } from "../errors.js";
import type { UserRepository } from "../repositories/userRepository.js";
import type { LoginInput, RegisterInput } from "../schemas/auth.schemas.js";
import type { User } from "../types.js";

let dummyHash: Promise<string> | undefined;
const getDummyHash = () => (dummyHash ??= hashPassword("not-a-real-password"));

export function createAuthService({ users }: { users: UserRepository }) {
  async function register(input: RegisterInput): Promise<User> {
    const passwordHash = await hashPassword(input.password);
    return users.create({ email: input.email, name: input.name, passwordHash });
  }

  async function login(input: LoginInput) {
    const record = await users.findByEmail(input.email);

    const hash = record?.passwordHash ?? (await getDummyHash());
    const passwordOk = await verifyPassword(hash, input.password);

    if (!record || !passwordOk) throw new UnauthorizedError("Invalid email or password.");

    const user: User = {
      id: record.id,
      email: record.email,
      name: record.name,
      createdAt: record.createdAt,
    };
    return {
      accessToken: await signAccessToken(user.id),
      tokenType: "Bearer" as const,
      expiresIn: config.accessTokenTtl,
      user,
    };
  }

  async function authenticate(token: string): Promise<User> {
    const id = await verifyAccessToken(token);
    const user = await users.findById(id);
    if (!user) throw new UnauthorizedError("Invalid or expired token.");
    return user;
  }

  return { register, login, authenticate };
}

export type AuthService = ReturnType<typeof createAuthService>;