import type { Express } from "express";
import { Redis } from "ioredis";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser } from "../support/auth.js";
import { buildApp } from "../support/buildApp.js";
import { TEST_REDIS_URL } from "../support/env.js";
import { createProject, createUser } from "../support/factories.js";
import { BASELINE_STATS, day, statsDataset } from "../support/scenarios.js";

let app: Express;
let stop: () => Promise<void>;

beforeAll(async () => {
  const built = await buildApp({ REDIS_URL: TEST_REDIS_URL });
  expect(built.connected).toBe(true);
  app = built.app;
  stop = built.stop;
});
afterAll(async () => {
  await stop();
});

type Client = Awaited<ReturnType<typeof asUser>>;
const statsUrl = (projectId: number) => `/projects/${projectId}/stats`;
const as = (user: { id: number }) => asUser(user, app);

describe("GET /projects/:id/stats", () => {
  it("computes the right numbers, then serves the same answer from the cache", async () => {
    const { owner, project } = await statsDataset();
    const user = await as(owner);

    const first = await user.get(statsUrl(project.id));
    const second = await user.get(statsUrl(project.id));

    expect(first.status).toBe(200);
    expect(first.headers["x-cache"]).toBe("miss");
    expect(first.body.data).toMatchObject({
      projectId: project.id,
      ...BASELINE_STATS,
      asOf: day(0),
    });
    expect(second.headers["x-cache"]).toBe("hit");
    expect(second.body.data).toEqual(first.body.data); // identical, including when it was computed
  });

  it("is not cacheable by shared caches", async () => {
    const { owner, project } = await statsDataset();
    const res = await (await as(owner)).get(statsUrl(project.id));
    expect(res.headers["cache-control"]).toBe("private, no-cache");
  });

  it("serves any member from the same entry", async () => {
    const { owner, member, project } = await statsDataset();
    await (await as(owner)).get(statsUrl(project.id));

    const res = await (await as(member)).get(statsUrl(project.id));

    expect(res.headers["x-cache"]).toBe("hit");
  });

  it("keeps different projects apart", async () => {
    const { owner, project } = await statsDataset();
    const empty = await createProject({ owner });
    const user = await as(owner);
    await user.get(statsUrl(project.id));

    const res = await user.get(statsUrl(empty.id));

    expect(res.headers["x-cache"]).toBe("miss");
    expect(res.body.data).toMatchObject({ total: 0, overdue: 0, dueSoon: 0 });
  });

  it("answers 400 for a bad id", async () => {
    const { owner } = await statsDataset();
    expect((await (await as(owner)).get("/projects/abc/stats")).status).toBe(400);
  });
});

describe("a cached answer never reaches someone who must not see it", () => {
  it("answers 404 to a stranger even while the entry is warm", async () => {
    const { owner, stranger, project } = await statsDataset();
    await (await as(owner)).get(statsUrl(project.id)); // warm
    expect((await (await as(owner)).get(statsUrl(project.id))).headers["x-cache"]).toBe("hit");

    const res = await (await as(stranger)).get(statsUrl(project.id));

    expect(res.status).toBe(404);
    expect(res.headers["x-cache"]).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain("total");
  });

  it("answers a stranger identically for a missing project", async () => {
    const { stranger, project } = await statsDataset();
    const user = await as(stranger);

    const hidden = await user.get(statsUrl(project.id));
    const missing = await user.get(statsUrl(999_999));

    expect(hidden.status).toBe(404);
    expect(missing.status).toBe(404);
  });

  it("stops serving a member the moment they are removed from the project", async () => {
    const { owner, member, project } = await statsDataset();
    const memberClient = await as(member);
    await memberClient.get(statsUrl(project.id));
    expect((await memberClient.get(statsUrl(project.id))).headers["x-cache"]).toBe("hit");

    await (await as(owner)).delete(`/projects/${project.id}/members/${member.id}`);

    expect((await memberClient.get(statsUrl(project.id))).status).toBe(404);
  });

  it("does not let a member of one project read another project's entry", async () => {
    const { owner, project } = await statsDataset();
    await (await as(owner)).get(statsUrl(project.id));
    const outsider = await createUser();
    const theirs = await createProject({ owner: outsider });
    const user = await as(outsider);
    await user.get(statsUrl(theirs.id));

    expect((await user.get(statsUrl(project.id))).status).toBe(404);
  });

  it("stores aggregate numbers only: never titles, names or email addresses", async () => {
    const { owner, project } = await statsDataset();
    await (await as(owner)).get(statsUrl(project.id));

    const inspector = new Redis(TEST_REDIS_URL);
    try {
      const keys = await inspector.keys("cache:*");
      expect(keys.length).toBeGreaterThan(0);
      let everything = keys.join("\n");
      for (const key of keys.filter((k) => k.startsWith("cache:v1:"))) {
        expect(key).toMatch(/^cache:v1:project-stats:project:\d+:\d+:\d{4}-\d{2}-\d{2}$/);
        const raw = (await inspector.get(key)) ?? "{}";
        everything += raw;
        expect(Object.keys(JSON.parse(raw) as object).sort()).toEqual([
          "asOf",
          "byPriority",
          "byStatus",
          "computedAt",
          "dueSoon",
          "overdue",
          "projectId",
          "total",
        ]);
      }
      for (const secret of ["overdue todo", "due soon", "Olga", "Max", "@example.com"]) {
        expect(everything).not.toContain(secret);
      }
    } finally {
      inspector.disconnect();
    }
  });
});

describe("a write is visible on the very next read", () => {
  type Ctx = Awaited<ReturnType<typeof statsDataset>>;
  const writes: Array<[string, (ctx: Ctx, user: Client) => Promise<{ status: number }>, object]> = [
    [
      "creating a task",
      (c, u) => u.post("/tasks", { title: "new task", projectId: c.project.id }),
      {
        total: 6,
        byStatus: { todo: 4, in_progress: 1, done: 1 },
        byPriority: { low: 2, medium: 3, high: 1 },
      },
    ],
    [
      "changing a status",
      (c, u) => u.patch(`/tasks/${c.overdueTodo.id}`, { status: "done" }),
      {
        byStatus: { todo: 2, in_progress: 1, done: 2 },
        overdue: 0,
      },
    ],
    [
      "changing a priority",
      (c, u) => u.patch(`/tasks/${c.soon.id}`, { priority: "high" }),
      {
        byPriority: { low: 2, medium: 1, high: 2 },
      },
    ],
    [
      "moving a due date into the past",
      (c, u) => u.patch(`/tasks/${c.soon.id}`, { dueDate: day(-3) }),
      {
        overdue: 2,
        dueSoon: 0,
      },
    ],
    [
      "clearing a due date",
      (c, u) => u.patch(`/tasks/${c.overdueTodo.id}`, { dueDate: null }),
      { overdue: 0 },
    ],
    [
      "moving a task out of the project",
      (c, u) => u.patch(`/tasks/${c.overdueTodo.id}`, { projectId: null }),
      {
        total: 4,
        overdue: 0,
        byStatus: { todo: 2, in_progress: 1, done: 1 },
      },
    ],
    [
      "deleting a task",
      (c, u) => u.delete(`/tasks/${c.soon.id}`),
      {
        total: 4,
        dueSoon: 0,
        byStatus: { todo: 3, in_progress: 0, done: 1 },
      },
    ],
  ];

  it.each(writes)("after %s", async (_name, write, expected) => {
    const ctx = await statsDataset();
    const user = await as(ctx.owner);
    await user.get(statsUrl(ctx.project.id));
    expect((await user.get(statsUrl(ctx.project.id))).headers["x-cache"]).toBe("hit");

    const written = await write(ctx, user);
    expect(written.status).toBeLessThan(300);

    const after = await user.get(statsUrl(ctx.project.id));
    expect(after.headers["x-cache"]).toBe("miss");
    expect(after.body.data).toMatchObject(expected);
  });

  it("refreshes BOTH projects when a task moves between them", async () => {
    const ctx = await statsDataset();
    const target = await createProject({ owner: ctx.owner });
    const user = await as(ctx.owner);
    await user.get(statsUrl(ctx.project.id));
    await user.get(statsUrl(target.id));

    await user.patch(`/tasks/${ctx.overdueTodo.id}`, { projectId: target.id });

    const source = await user.get(statsUrl(ctx.project.id));
    const destination = await user.get(statsUrl(target.id));
    expect(source.headers["x-cache"]).toBe("miss");
    expect(destination.headers["x-cache"]).toBe("miss");
    expect(source.body.data.total).toBe(4);
    expect(destination.body.data).toMatchObject({ total: 1, overdue: 1 });
  });

  it("refreshes the target when two projects are merged", async () => {
    const ctx = await statsDataset();
    const target = await createProject({ owner: ctx.owner });
    const user = await as(ctx.owner);
    await user.get(statsUrl(target.id));

    await user.post(`/projects/${ctx.project.id}/merge`, { intoProjectId: target.id });

    const after = await user.get(statsUrl(target.id));
    expect(after.headers["x-cache"]).toBe("miss");
    expect(after.body.data).toMatchObject(BASELINE_STATS);
    expect((await user.get(statsUrl(ctx.project.id))).status).toBe(404);
  });

  it("gives a duplicated project its own statistics, with every task reset to todo", async () => {
    const ctx = await statsDataset();
    const user = await as(ctx.owner);
    await user.get(statsUrl(ctx.project.id));

    const copy = await user.post(`/projects/${ctx.project.id}/duplicate`);
    const copyId = (copy.body.data as { project: { id: number } }).project.id;

    const stats = await user.get(statsUrl(copyId));
    expect(stats.body.data).toMatchObject({
      projectId: copyId,
      total: 5,
      byStatus: { todo: 5, in_progress: 0, done: 0 },
    });
  });
});

describe("a stampede", () => {
  it("shares one computation between simultaneous requests on a cold cache", async () => {
    const { owner, project } = await statsDataset();
    const user = await as(owner);

    const responses = await Promise.all(
      Array.from({ length: 20 }, () => user.get(statsUrl(project.id))),
    );

    expect(responses.every((r) => r.status === 200)).toBe(true);
    expect(new Set(responses.map((r) => r.body.data.computedAt as string)).size).toBe(1);
  });
});
