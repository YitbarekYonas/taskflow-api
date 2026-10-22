export function isPrismaError(err: unknown, code: string): boolean {
  return typeof err === "object" && err !== null && (err as { code?: unknown }).code === code;
}