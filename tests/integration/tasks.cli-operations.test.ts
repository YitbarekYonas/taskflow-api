import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SYSTEM } from "../../src/auth/policy.js";
import { taskService } from "../../src/container.js";
import { ForbiddenError, UserError } from "../../src/errors.js";
import { createTask } from "../support/factories.js";

describe("operations reserved for the CLI", () => {
  it("lists every task regardless of owner, optionally by status", async () => {
    await createTask({ status: "todo" });
    await createTask({ status: "done" });
    await createTask({ status: "done" });

    expect(await taskService.listTasks({}, SYSTEM)).toHaveLength(3);
    expect(await taskService.listTasks({ status: "done" }, SYSTEM)).toHaveLength(2);
  });

  it("finds overdue tasks: past due date, not done, with an injected 'today'", async () => {
    await createTask({ title: "overdue", status: "todo", dueDate: "2026-01-01" });
    await createTask({ title: "overdue but done", status: "done", dueDate: "2026-01-01" });
    await createTask({ title: "due today", status: "todo", dueDate: "2026-06-01" });
    await createTask({ title: "in the future", status: "todo", dueDate: "2999-01-01" });
    await createTask({ title: "no due date", status: "todo" });

    const overdue = await taskService.listOverdue(SYSTEM, "2026-06-01");

    expect(overdue.map((t) => t.title)).toEqual(["overdue"]);
  });

  it("counts tasks per status, including statuses with none", async () => {
    await createTask({ status: "todo" });
    await createTask({ status: "todo" });
    await createTask({ status: "done" });

    expect(await taskService.summary(SYSTEM)).toEqual({ todo: 2, in_progress: 0, done: 1 });
  });

  describe("CSV export", () => {
    it("writes a header and one escaped row per task", async () => {
      await createTask({
        title: 'Say "hi", then leave',
        status: "in_progress",
        priority: "high",
        dueDate: "2030-05-01",
      });
      const dir = await mkdtemp(path.join(tmpdir(), "taskflow-"));
      try {
        const file = path.join(dir, "out.csv");

        expect(await taskService.exportCsv(file, SYSTEM)).toBe(file);

        const lines = (await readFile(file, "utf-8")).trim().split("\n");
        expect(lines[0]).toBe("id,title,status,priority,dueDate,createdAt");
        expect(lines[1]).toMatch(
          /^\d+,"Say ""hi"", then leave",in_progress,high,2030-05-01,\d{4}-/,
        );
        expect(lines).toHaveLength(2);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });

    it("refuses a file that does not end in .csv", async () => {
      await expect(taskService.exportCsv("tasks.txt", SYSTEM)).rejects.toBeInstanceOf(UserError);
    });
  });

  it.each([
    ["listTasks", () => taskService.listTasks({}, { kind: "user", id: 1 })],
    ["listOverdue", () => taskService.listOverdue({ kind: "user", id: 1 })],
    ["summary", () => taskService.summary({ kind: "user", id: 1 })],
    ["exportCsv", () => taskService.exportCsv("x.csv", { kind: "user", id: 1 })],
  ])(
    "%s refuses a logged-in user, so it can never be exposed over HTTP by accident",
    async (_name, call) => {
      await expect(call()).rejects.toBeInstanceOf(ForbiddenError);
    },
  );
});
