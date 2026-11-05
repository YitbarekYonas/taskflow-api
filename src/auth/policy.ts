import { ForbiddenError } from "../errors.js";
import type { Role } from "../types.js";

export type { Role };

// Who is doing this? "system" is our own CLI, never an HTTP caller.
export type Actor = { kind: "user"; id: number } | { kind: "system" };

export const SYSTEM: Actor = { kind: "system" };

export const creatorOf = (actor: Actor): number | undefined =>
  actor.kind === "user" ? actor.id : undefined;

// For operations that exist only for our own CLI. Because they demand an actor,
// nobody can expose them over HTTP by accident: they would throw.
export function assertSystem(actor: Actor): void {
  if (actor.kind !== "system") {
    throw new ForbiddenError("This operation is not available over the API.");
  }
}