import { UserError } from "./errors.js";


export function findById<T extends { id: number }>(
  items: T[],
  id: number,
  label = "item"
): T {
  const item = items.find((i) => i.id === id);
  if (!item) throw new UserError(`No ${label} with id ${id}.`);
  return item;
}


function isOneOf<T extends string>(value: string, allowed: readonly T[]): value is T {
  return (allowed as readonly string[]).includes(value);
}

export function parseChoice<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
  name: string
): T | undefined {
  if (value === undefined) return undefined;
  if (!isOneOf(value, allowed)) {
    throw new UserError(`${name} must be one of: ${allowed.join(", ")}`);
  }
  return value; 
}