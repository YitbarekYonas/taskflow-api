import { createHash, randomBytes, randomUUID } from "node:crypto";

// 256 bits of randomness, safe to put in JSON or a header
export const generateRefreshToken = (): string => randomBytes(32).toString("base64url");

// What gets stored. A fast hash is correct here because the input is already unguessable.
export const hashRefreshToken = (token: string): string =>
  createHash("sha256").update(token).digest("hex");

export const newFamilyId = (): string => randomUUID();