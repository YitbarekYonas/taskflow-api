import type { Express } from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser } from "../support/auth.js";
import { buildApp } from "../support/buildApp.js";
import { createProject, createUser } from "../support/factories.js";

let app: Express;
let stop: () => Promise<void>;

beforeAll(async () => {
  const built = await buildApp({ REDIS_URL: "redis://127.0.0.1:6390/15" }); // nothing listens on this port
  expect(built.connected).toBe(false);
  app = built.app;
  stop = built.stop;
}, 30_000);
afterAll(async () => {
  await stop();
});

describe("statistics while Redis is unreachable", () => {
  it("still answers, straight from the database, and says so", async () => {
    const owner = await createUser();
    const project = await createProject({ owner });
    const user = await asUser(owner, app);

    const res = await user.get(`/projects/${project.id}/stats`);

    expect(res.status).toBe(200);
    expect(res.headers["x-cache"]).toBe("bypass");
    expect(res.body.data.total).toBe(0);
  });

  it("never fails a write because the cache cannot be invalidated, and the next read is correct", async () => {
    const owner = await createUser();
    const project = await createProject({ owner });
    const user = await asUser(owner, app);
    await user.get(`/projects/${project.id}/stats`);

    const created = await user.post("/tasks", {
      title: "while Redis is down",
      projectId: project.id,
    });
    const stats = await user.get(`/projects/${project.id}/stats`);

    expect(created.status).toBe(201);
    expect(stats.body.data.total).toBe(1);
  });

  it("still refuses strangers", async () => {
    const owner = await createUser();
    const stranger = await createUser();
    const project = await createProject({ owner });

    expect((await (await asUser(stranger, app)).get(`/projects/${project.id}/stats`)).status).toBe(
      404,
    );
  });
});
