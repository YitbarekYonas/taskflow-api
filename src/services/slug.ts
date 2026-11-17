import { randomBytes } from "node:crypto";

export function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .slice(0, 50)
      .replace(/^-+|-+$/g, "") || "project"
  );
}

// The random suffix keeps slugs unique without a lookup, so no check-then-insert race
export function makeSlug(name: string): string {
  return `${slugify(name)}-${randomBytes(3).toString("hex")}`;
}
