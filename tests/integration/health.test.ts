import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { api } from "../support/app.js";

describe("GET /health and /ready", () => {
  it("/health says the process is alive without touching any dependency", async () => {
    const res = await api().get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });

  it("/ready reports ok when the database works and Redis is not configured", async () => {
    const res = await api().get("/ready");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", checks: { database: "up", redis: "disabled" } });
  });

  it("/ready answers 503 when the database is down", async () => {
    const app = createApp({
      readiness: async () => ({ status: "unavailable", checks: { database: "down", redis: "up" } }),
    });

    const res = await request(app).get("/ready");

    expect(res.status).toBe(503);
    expect(res.body.checks.database).toBe("down");
  });

  it("/ready stays 200 when only Redis is down", async () => {
    const app = createApp({
      readiness: async () => ({ status: "degraded", checks: { database: "up", redis: "down" } }),
    });

    expect((await request(app).get("/ready")).status).toBe(200);
  });
});
