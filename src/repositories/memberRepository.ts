import type { Role } from "../types.js";

export type Member = { userId: number; name: string; role: Role; joinedAt: string };

export interface MemberRepository {
  roleOf(projectId: number, userId: number): Promise<Role | undefined>;
  list(projectId: number): Promise<Member[]>;
  // throws DuplicateError if already a member, InvalidReferenceError if the project or user is gone
  add(projectId: number, userId: number, role: Role): Promise<void>;
  setRole(projectId: number, userId: number, role: Role): Promise<boolean>;
  remove(projectId: number, userId: number): Promise<boolean>;
  countOwners(projectId: number): Promise<number>;
  // Holds a row lock on the project until the surrounding transaction ends.
  // Only meaningful inside UnitOfWork.run.
  lockProject(projectId: number): Promise<boolean>;
}