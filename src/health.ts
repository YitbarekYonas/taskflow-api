export type CheckResult = "up" | "down" | "disabled";

export type Readiness = {
  status: "ok" | "degraded" | "unavailable";
  checks: { database: "up" | "down"; redis: CheckResult };
};

// Runs a check with a deadline: a hanging dependency must not hang the probe
async function probe(check: () => Promise<unknown>, timeoutMs: number): Promise<"up" | "down"> {
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      check(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("timeout")), timeoutMs);
      }),
    ]);
    return "up";
  } catch {
    return "down";
  } finally {
    clearTimeout(timer);
  }
}

export async function checkReadiness(deps: {
  database: () => Promise<unknown>;
  redis?: () => Promise<unknown>;
  timeoutMs?: number;
}): Promise<Readiness> {
  const timeoutMs = deps.timeoutMs ?? 1_000;
  const [database, redis] = await Promise.all([
    probe(deps.database, timeoutMs),
    deps.redis ? probe(deps.redis, timeoutMs) : Promise.resolve("disabled" as const),
  ]);

  // The database is required. Redis down only degrades: limits fall back to memory.
  const status = database === "down" ? "unavailable" : redis === "down" ? "degraded" : "ok";
  return { status, checks: { database, redis } };
}
