export function migrateLegacyTask(raw: unknown): unknown {
  if (typeof raw !== "object" || raw === null) return raw;
  const record = raw as Record<string, unknown>;
  if ("done" in record && !("status" in record)) {
    const { done, ...rest } = record;
    return {
      ...rest,
      status: done ? "done" : "todo",
      priority: "medium",
      createdAt: new Date().toISOString(),
    };
  }
  return raw;
}