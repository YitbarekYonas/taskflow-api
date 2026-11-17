import { beforeEach, describe, expect, it } from "vitest";
import { asUser } from "../support/auth.js";
import { createProject, createTask, createUser } from "../support/factories.js";

type Row = { id: number; title: string; priority: string };
const titles = (body: { data: Row[] }) => body.data.map((t) => t.title);

describe("GET /tasks: visibility", () => {
  it("shows only tasks in your projects plus your own personal tasks", async () => {
    const alice = await createUser();
    const bob = await createUser();
    const shared = await createProject({ owner: alice, members: [{ user: bob }] });
    const bobsOwn = await createProject({ owner: bob });
    await createTask({ title: "shared task", project: shared, createdBy: alice });
    await createTask({ title: "bob's project task", project: bobsOwn, createdBy: bob });
    await createTask({ title: "alice personal", createdBy: alice });
    await createTask({ title: "bob personal", createdBy: bob });
    await createTask({ title: "legacy, nobody's" });

    const forAlice = await (await asUser(alice)).get("/tasks?sort=title");
    const forBob = await (await asUser(bob)).get("/tasks?sort=title");

    expect(titles(forAlice.body)).toEqual(["alice personal", "shared task"]);
    expect(titles(forBob.body)).toEqual(["bob personal", "bob's project task", "shared task"]);
  });

  it("counts only visible tasks in meta.total", async () => {
    const alice = await createUser();
    const bob = await createUser();
    const hidden = await createProject({ owner: bob });
    for (let i = 0; i < 5; i++) await createTask({ project: hidden, createdBy: bob });
    await createTask({ createdBy: alice });

    const res = await (await asUser(alice)).get("/tasks");

    expect(res.body.meta.total).toBe(1);
    expect(res.body.data).toHaveLength(1);
  });

  it("returns an empty page, not an error, when filtering by a project you cannot see", async () => {
    const alice = await createUser();
    const bob = await createUser();
    const hidden = await createProject({ owner: bob });
    await createTask({ project: hidden, createdBy: bob });

    const res = await (await asUser(alice)).get(`/tasks?projectId=${hidden.id}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.total).toBe(0);
  });
});

describe("GET /tasks: filtering and sorting", () => {
  let user: Awaited<ReturnType<typeof asUser>>;

  // Ids follow creation order. Dates and priorities are chosen so every ordering differs.
  beforeEach(async () => {
    const owner = await createUser();
    const project = await createProject({ owner });
    const rows = [
      { title: "write report", status: "todo", priority: "high", dueDate: "2026-12-01" },
      { title: "review report", status: "in_progress", priority: "medium", dueDate: undefined },
      { title: "plan sprint", status: "todo", priority: "low", dueDate: "2026-11-15" },
      { title: "fix login bug", status: "done", priority: "high", dueDate: undefined },
      { title: "deploy app", status: "todo", priority: "medium", dueDate: "2026-11-20" },
      { title: "update docs", status: "done", priority: "low", dueDate: "2026-11-10" },
    ] as const;
    for (const [i, row] of rows.entries()) {
      await createTask({
        ...row,
        project,
        createdBy: owner,
        createdAt: `2026-10-0${i + 1}T10:00:00Z`,
      });
    }
    user = await asUser(owner);
  });

  it.each([
    ["by status", "status=todo", ["deploy app", "plan sprint", "write report"]],
    ["by priority", "priority=high", ["fix login bug", "write report"]],
    ["by search text, ignoring case", "search=REPORT", ["review report", "write report"]],
    ["by status and priority together", "status=todo&priority=high", ["write report"]],
    ["by status and search together", "status=done&search=docs", ["update docs"]],
    ["with no matches", "search=nothing", []],
  ])("filters %s", async (_name, query, expected) => {
    const res = await user.get(`/tasks?sort=title&${query}`);

    expect(res.status).toBe(200);
    expect(titles(res.body)).toEqual(expected);
    expect(res.body.meta.total).toBe(expected.length);
  });

  it.each([
    [
      "createdAt ascending (the default)",
      "",
      [
        "write report",
        "review report",
        "plan sprint",
        "fix login bug",
        "deploy app",
        "update docs",
      ],
    ],
    [
      "title ascending",
      "sort=title",
      [
        "deploy app",
        "fix login bug",
        "plan sprint",
        "review report",
        "update docs",
        "write report",
      ],
    ],
    [
      "title descending",
      "sort=title&order=desc",
      [
        "write report",
        "update docs",
        "review report",
        "plan sprint",
        "fix login bug",
        "deploy app",
      ],
    ],
    // ties on priority are broken by id, so the order is fully defined
    [
      "priority descending",
      "sort=priority&order=desc",
      [
        "write report",
        "fix login bug",
        "review report",
        "deploy app",
        "plan sprint",
        "update docs",
      ],
    ],
    [
      "priority ascending",
      "sort=priority&order=asc",
      [
        "plan sprint",
        "update docs",
        "review report",
        "deploy app",
        "write report",
        "fix login bug",
      ],
    ],
    // tasks without a due date come last, in BOTH directions
    [
      "dueDate ascending",
      "sort=dueDate&order=asc",
      [
        "update docs",
        "plan sprint",
        "deploy app",
        "write report",
        "review report",
        "fix login bug",
      ],
    ],
    [
      "dueDate descending",
      "sort=dueDate&order=desc",
      [
        "write report",
        "deploy app",
        "plan sprint",
        "update docs",
        "review report",
        "fix login bug",
      ],
    ],
  ])("sorts by %s", async (_name, query, expected) => {
    const res = await user.get(`/tasks?${query}`);

    expect(res.status).toBe(200);
    expect(titles(res.body)).toEqual(expected);
  });
});

describe("GET /tasks: pagination", () => {
  let user: Awaited<ReturnType<typeof asUser>>;

  beforeEach(async () => {
    const owner = await createUser();
    const project = await createProject({ owner });
    const priorities = ["low", "medium", "high"] as const;
    for (let i = 1; i <= 25; i++) {
      await createTask({
        title: `task ${String(i).padStart(2, "0")}`,
        priority: priorities[i % 3],
        project,
        createdBy: owner,
      });
    }
    user = await asUser(owner);
  });

  it.each([
    [1, 10, { total: 25, totalPages: 3, hasNext: true, hasPrev: false }, 10],
    [2, 10, { total: 25, totalPages: 3, hasNext: true, hasPrev: true }, 10],
    [3, 10, { total: 25, totalPages: 3, hasNext: false, hasPrev: true }, 5],
    [99, 10, { total: 25, totalPages: 3, hasNext: false, hasPrev: true }, 0], // past the end: 200, empty
    [1, 100, { total: 25, totalPages: 1, hasNext: false, hasPrev: false }, 25],
  ])("page %i with limit %i has the right meta and size", async (page, limit, meta, size) => {
    const res = await user.get(`/tasks?page=${page}&limit=${limit}`);

    expect(res.status).toBe(200);
    expect(res.body.meta).toEqual({ page, limit, ...meta });
    expect(res.body.data).toHaveLength(size);
  });

  it("walks every page without repeating or skipping a task, even when sorting by a column full of ties", async () => {
    const seen: Row[] = [];
    for (const page of [1, 2, 3]) {
      const res = await user.get(`/tasks?sort=priority&order=desc&limit=10&page=${page}`);
      seen.push(...res.body.data);
    }

    expect(new Set(seen.map((t) => t.id)).size).toBe(25);
    const rank = { low: 0, medium: 1, high: 2 } as Record<string, number>;
    const ranks = seen.map((t) => rank[t.priority]);
    expect(ranks).toEqual([...ranks].sort((a, b) => b - a)); // never goes back up
  });

  it.each([
    ["page 0", "page=0"],
    ["a non-numeric page", "page=abc"],
    ["limit 0", "limit=0"],
    ["limit above the cap", "limit=101"],
    ["an unknown sort field", "sort=banana"],
    ["a repeated status", "status=todo&status=done"],
    ["a project id beyond INTEGER", "projectId=99999999999"],
    ["a NUL character in the search", "search=a%00b"],
  ])("rejects %s with 400", async (_name, query) => {
    const res = await user.get(`/tasks?${query}`);

    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe("Validation failed");
  });
});
