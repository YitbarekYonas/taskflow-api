import type { User } from "../types.js";

// Only the login path ever sees this type
export type UserRecord = User & { passwordHash: string };

export interface UserRepository {
  findById(id: number): Promise<User | undefined>;
  findByEmail(email: string): Promise<UserRecord | undefined>;
  create(data: { email: string; name: string; passwordHash: string }): Promise<User>;
}