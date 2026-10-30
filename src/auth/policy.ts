import { ForbiddenError } from "../errors.js";

export type Actor = { kind: "user"; id: number } | { kind: "system" };

export const SYSTEM: Actor = { kind: "system" };

export const creatorOf = (actor: Actor): number | undefined =>
  actor.kind === "user" ? actor.id : undefined;

export function assertOwner(actor: Actor, ownerId: number | undefined, what: string): void {
  if (actor.kind === "system") return;
  if (ownerId !== actor.id) {
    throw new ForbiddenError(`You do not have permission to change this ${what}.`);
  }
}