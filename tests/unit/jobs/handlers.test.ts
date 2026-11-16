import { describe, expect, it, vi } from "vitest";
import { createHandlers } from "../../../src/jobs/handlers.js";
import type { Mailer } from "../../../src/mail/mailer.js";
import type { Task, User } from "../../../src/types.js";

const task: Task = {
  id: 1,
  title: "Write tests",
  status: "todo",
  priority: "high",
  createdAt: "2026-01-01T00:00:00.000Z",
  projectId: 5,
  assigneeId: 2,
};
const alex: User = {
  id: 2,
  email: "alex@example.com",
  name: "Alex",
  createdAt: "2026-01-01T00:00:00.000Z",
};
const sam: User = {
  id: 3,
  email: "sam@example.com",
  name: "Sam",
  createdAt: "2026-01-01T00:00:00.000Z",
};
const payload = { taskId: 1, assigneeId: 2, assignedById: 3 };

function setup(
  overrides: { task?: Task | undefined; users?: Record<number, User | undefined> } = {},
) {
  const send = vi.fn(async () => {});
  const mailer: Mailer = { send };
  const users = overrides.users ?? { 2: alex, 3: sam };
  const handlers = createHandlers({
    tasks: { findById: async () => ("task" in overrides ? overrides.task : task) },
    projects: {
      findById: async () => ({
        id: 5,
        name: "TaskFlow API",
        slug: "taskflow-api",
        createdAt: "2026-01-01T00:00:00.000Z",
      }),
    },
    users: { findById: async (id: number) => users[id] },
    mailer,
  });
  return { handlers, send };
}

describe("task-assigned", () => {
  it("emails the assignee, naming who assigned the task and where", async () => {
    const { handlers, send } = setup();

    expect(await handlers["task-assigned"](payload)).toEqual({ outcome: "sent" });

    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ to: "alex@example.com", subject: "Sam assigned you: Write tests" }),
    );
  });

  it.each([
    ["the task was deleted", { task: undefined }, "task no longer exists"],
    [
      "the task was reassigned",
      { task: { ...task, assigneeId: 9 } },
      "task is no longer assigned to this user",
    ],
    [
      "the task was unassigned",
      { task: { ...task, assigneeId: undefined } },
      "task is no longer assigned to this user",
    ],
    ["the assignee's account is gone", { users: { 3: sam } }, "assignee no longer exists"],
  ])("sends nothing when %s", async (_name, overrides, reason) => {
    const { handlers, send } = setup(overrides);

    expect(await handlers["task-assigned"](payload)).toEqual({ outcome: "skipped", reason });
    expect(send).not.toHaveBeenCalled();
  });

  it("still sends when the person who assigned the task has since left", async () => {
    const { handlers, send } = setup({ users: { 2: alex } });

    expect(await handlers["task-assigned"](payload)).toEqual({ outcome: "sent" });
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ subject: "Someone assigned you: Write tests" }),
    );
  });

  it("lets a mail failure escape, so the queue can retry the job", async () => {
    const { handlers, send } = setup();
    send.mockRejectedValue(new Error("smtp down"));

    await expect(handlers["task-assigned"](payload)).rejects.toThrow("smtp down");
  });
});
