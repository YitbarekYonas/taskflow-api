import { describe, expect, it } from "vitest";
import { checkReadiness } from "../../src/health.js";

const up = () => Promise.resolve();
const down = () => Promise.reject(new Error("down"));
const hangs = () => new Promise<never>(() => {});

describe("checkReadiness", () => {
  it.each([
    ["everything up", up, up, "ok", "up", "up"],
    ["Redis not configured", up, undefined, "ok", "up", "disabled"],
    ["Redis down: degraded, still serving", up, down, "degraded", "up", "down"],
    ["database down: unavailable", down, up, "unavailable", "down", "up"],
    ["both down: unavailable", down, down, "unavailable", "down", "down"],
  ] as const)("%s", async (_name, database, redis, status, dbResult, redisResult) => {
    expect(await checkReadiness({ database, redis })).toEqual({
      status,
      checks: { database: dbResult, redis: redisResult },
    });
  });

  it("treats a hanging dependency as down instead of hanging itself", async () => {
    const started = Date.now();
    const result = await checkReadiness({ database: up, redis: hangs, timeoutMs: 30 });

    expect(result.checks.redis).toBe("down");
    expect(Date.now() - started).toBeLessThan(500);
  });
});
