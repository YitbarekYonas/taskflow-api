import { hashPassword, verifyPassword } from "../auth/password.js";
import {
  generateRefreshToken,
  hashRefreshToken,
  newFamilyId,
} from "../auth/refreshTokens.js";
import { signAccessToken, verifyAccessToken } from "../auth/tokens.js";
import { config } from "../config.js";
import { UnauthorizedError } from "../errors.js";
import { logger } from "../logger.js";
import type { RefreshTokenRepository } from "../repositories/refreshTokenRepository.js";
import type { UserRepository } from "../repositories/userRepository.js";
import type { LoginInput, RegisterInput } from "../schemas/auth.schemas.js";
import type { User } from "../types.js";

type Deps = { users: UserRepository; refreshTokens: RefreshTokenRepository };

// Verified against when the email is unknown, so "no such user" costs as much as "wrong password"
let dummyHash: Promise<string> | undefined;
const getDummyHash = () => (dummyHash ??= hashPassword("not-a-real-password"));

const invalidRefresh = () => new UnauthorizedError("Invalid or expired refresh token.");

export function createAuthService({ users, refreshTokens }: Deps) {
  async function register(input: RegisterInput): Promise<User> {
    const passwordHash = await hashPassword(input.password);
    return users.create({ email: input.email, name: input.name, passwordHash });
  }

  // Creates a new refresh token (in an existing family, or a brand-new one) plus an access token
  async function issueSession(user: User, familyId: string = newFamilyId()) {
    const refreshToken = generateRefreshToken();
    await refreshTokens.create({
      userId: user.id,
      tokenHash: hashRefreshToken(refreshToken),
      familyId,
      expiresAt: new Date(Date.now() + config.refreshTokenTtlDays * 86_400_000),
    });
    return {
      accessToken: await signAccessToken(user.id),
      tokenType: "Bearer" as const,
      expiresIn: config.accessTokenTtl,
      refreshToken,
      refreshExpiresIn: config.refreshTokenTtlDays * 86_400,
      user,
    };
  }

  async function login(input: LoginInput) {
    const record = await users.findByEmail(input.email);

    const hash = record?.passwordHash ?? (await getDummyHash());
    const passwordOk = await verifyPassword(hash, input.password);
    if (!record || !passwordOk) throw new UnauthorizedError("Invalid email or password.");

    return issueSession({
      id: record.id,
      email: record.email,
      name: record.name,
      createdAt: record.createdAt,
    });
  }

  async function refresh(rawToken: string) {
    const record = await refreshTokens.findByHash(hashRefreshToken(rawToken));
    if (!record) throw invalidRefresh();

    // Logged out earlier: simply invalid, nothing suspicious about it
    if (record.revokedAt) throw invalidRefresh();

    // Already exchanged once: someone is replaying a stolen (or stale) token.
    // Kill the whole family so neither the thief nor the original holder keeps access.
    if (record.usedAt) {
      await refreshTokens.revokeFamily(record.familyId);
      logger.error(`Refresh token reuse detected: user ${record.userId}, family ${record.familyId}`);
      throw invalidRefresh();
    }

    if (record.expiresAt.getTime() <= Date.now()) throw invalidRefresh();

    // The atomic step: of any number of parallel requests, exactly one gets `true`
    if (!(await refreshTokens.markUsed(record.id))) {
      await refreshTokens.revokeFamily(record.familyId);
      throw invalidRefresh();
    }

    const user = await users.findById(record.userId);
    if (!user) throw invalidRefresh();

    return issueSession(user, record.familyId);
  }

  // Idempotent and silent: unknown or already-revoked tokens look exactly like valid ones
  async function logout(rawToken: string): Promise<void> {
    const record = await refreshTokens.findByHash(hashRefreshToken(rawToken));
    if (record) await refreshTokens.revokeFamily(record.familyId);
  }

  async function logoutAll(userId: number): Promise<void> {
    await refreshTokens.revokeAllForUser(userId);
  }

  async function purgeExpired(): Promise<number> {
    return refreshTokens.deleteExpired(new Date());
  }

  // A valid signature is not enough: the account must still exist
  async function authenticate(token: string): Promise<User> {
    const id = await verifyAccessToken(token);
    const user = await users.findById(id);
    if (!user) throw new UnauthorizedError("Invalid or expired token.");
    return user;
  }

  return { register, login, refresh, logout, logoutAll, purgeExpired, authenticate };
}

export type AuthService = ReturnType<typeof createAuthService>;