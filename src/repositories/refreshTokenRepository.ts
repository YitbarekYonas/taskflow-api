export type RefreshTokenRecord = {
  id: number;
  userId: number;
  familyId: string;
  expiresAt: Date;
  usedAt?: Date;
  revokedAt?: Date;
};

export interface RefreshTokenRepository {
  create(data: { userId: number; tokenHash: string; familyId: string; expiresAt: Date }): Promise<void>;
  findByHash(tokenHash: string): Promise<RefreshTokenRecord | undefined>;
  // true only for the ONE caller who flipped it from unused to used
  markUsed(id: number): Promise<boolean>;
  revokeFamily(familyId: string): Promise<number>;
  revokeAllForUser(userId: number): Promise<number>;
  // only rows that would be rejected anyway
  deleteExpired(now: Date): Promise<number>;
}