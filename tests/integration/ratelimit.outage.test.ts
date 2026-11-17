import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

let app: Express;
let teardown: () => Promise<void>;

describe("when Redis is unreachable", () => {
  beforeAll(async () => {
    vi.stubEnv("RATE_LIMIT_ENABLED", "true");
    vi.stubEnv("TRUST_PROXY_HOPS", "1");
    vi.stubEnv("REDIS_URL", "redis://127.0.0.1:6390/15"); // nothing listens on this port
    vi.resetModules();
    const { createApp } = await import("../../src/app.js");
    const { prisma } = await import("../../src/db.js");
    const { connectRedis, closeRedis } = await import("../../src/redis.js");
    expect(await connectRedis()).toBe(false); // startup does not throw: the app starts degraded
    app = createApp();
    teardown = async () => {
      await closeRedis();
      await prisma.$disconnect();
    };
  }, 30_000);

  afterAll(async () => {
    await teardown();
  });

  it("keeps limiting, in memory, and never answers with a server error", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const res = await request(app)
        .post("/auth/register")
        .set("X-Forwarded-For", "10.9.9.9")
        .send({});
      statuses.push(res.status);
    }

    expect(statuses).toEqual([400, 400, 400, 400, 400, 429]);
  });

  it("answers every request quickly instead of waiting for Redis", async () => {
    const started = Date.now();
    for (let i = 0; i < 5; i++) await request(app).get("/nope").set("X-Forwarded-For", "10.9.9.8");

    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it("reports itself as degraded, but still ready, on /ready", async () => {
    const res = await request(app).get("/ready").set("X-Forwarded-For", "10.9.9.7");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "degraded", checks: { database: "up", redis: "down" } });
  });
});
