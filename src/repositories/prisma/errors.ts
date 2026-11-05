import { InUseError, InvalidReferenceError } from "../../errors.js";

export function isPrismaError(err: unknown, code: string): boolean {
  return typeof err === "object" && err !== null && (err as { code?: unknown }).code === code;
}

export function mapWriteError(err: unknown): unknown {
  return isPrismaError(err, "P2003")
    ? new InvalidReferenceError("A referenced record does not exist.")
    : err;
}

export function mapDeleteError(err: unknown): unknown {
  return isPrismaError(err, "P2003")
    ? new InUseError("This record is still referenced by other records.")
    : err;
}