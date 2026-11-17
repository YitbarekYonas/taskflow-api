import type { Worker } from "bullmq";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Handlers } from "../../src/jobs/handlers.js";
import { BullJobQueue } from "../../src/jobs/queue.js";
import { startWorker } from "../../src/jobs/worker.js";
import { redisConnectionOptions } from "../../src/redis.js";
import { TEST_REDIS_URL } from "../support/env.js";
import { assertTestRedis } from "../support/redis.js";
import { waitFor } from "../support/waitFor.js";

const connection = redisConnectionOptions(TEST_REDIS_URL);
const payload = { taskId: 1, assigneeId: 2, assignedById: 3 };
const sent = { outcome: "sent" as const };

let queue: BullJobQueue;
let worker: Worker | undefined;

const handlersWith = (fn: (p: typeof payload) => Promise<unknown>) =>
  ({ "task-assigned": fn }) as unknown as Handlers;
const run = (handlers: Handlers) => (worker = startWorker({ connection, handlers }));
const failedJobs = () => queue.bull.getFailed();

beforeEach(() => {
  assertTestRedis();
  queue = new BullJobQueue({ connection, attempts: 3, backoffDelayMs: 10 });
});
afterEach(async () => {
  await worker?.close();
  worker = undefined;
  await queue.close();
});

describe("delivery", () => {
  it("hands the payload to the handler", async () => {
    const handler = vi.fn(async () => sent);
    run(handlersWith(handler));

    await queue.enqueue("task-assigned", payload);

    await waitFor(() => handler.mock.calls.length === 1);
    expect(handler).toHaveBeenCalledWith(payload);
  });

  it("keeps a job safely in Redis while no worker is running, and runs it when one starts", async () => {
    await queue.enqueue("task-assigned", payload);
    expect(await queue.bull.getWaitingCount()).toBe(1);

    const handler = vi.fn(async () => sent);
    run(handlersWith(handler));

    await waitFor(() => handler.mock.calls.length === 1);
  });

  it("refuses a bad payload at the producer, before it reaches Redis", async () => {
    await expect(queue.enqueue("task-assigned", { taskId: -1 } as never)).rejects.toThrow();
    expect(await queue.bull.getWaitingCount()).toBe(0);
  });
});

describe("retries", () => {
  it("retries a temporary failure with backoff until it succeeds", async () => {
    const handler = vi
      .fn()
      .mockRejectedValueOnce(new Error("timeout"))
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValue(sent);
    run(handlersWith(handler));

    await queue.enqueue("task-assigned", payload);

    await waitFor(async () => (await queue.bull.getCompletedCount()) === 1);
    expect(handler).toHaveBeenCalledTimes(3);
    expect(await queue.bull.getFailedCount()).toBe(0);
  });

  it("treats an SMTP 4xx answer as temporary", async () => {
    const handler = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error("421 try again later"), { responseCode: 421 }))
      .mockResolvedValue(sent);
    run(handlersWith(handler));

    await queue.enqueue("task-assigned", payload);

    await waitFor(async () => (await queue.bull.getCompletedCount()) === 1);
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("gives up after the configured attempts, and keeps the job in the failed list", async () => {
    const handler = vi.fn().mockRejectedValue(new Error("always broken"));
    run(handlersWith(handler));

    await queue.enqueue("task-assigned", payload);

    await waitFor(async () => (await queue.bull.getFailedCount()) === 1);
    expect(handler).toHaveBeenCalledTimes(3);
    const [job] = await failedJobs();
    expect(job.attemptsMade).toBe(3);
    expect(job.failedReason).toContain("always broken");
  });

  it("does not retry a permanent failure such as an SMTP 5xx answer", async () => {
    const handler = vi
      .fn()
      .mockRejectedValue(
        Object.assign(new Error("550 mailbox unavailable"), { responseCode: 550 }),
      );
    run(handlersWith(handler));

    await queue.enqueue("task-assigned", payload);

    await waitFor(async () => (await queue.bull.getFailedCount()) === 1);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("does not retry a malformed payload or an unknown job, and never calls the handler", async () => {
    const handler = vi.fn(async () => sent);
    run(handlersWith(handler));

    await queue.bull.add("task-assigned", { taskId: "not a number" }); // bypasses the producer's check
    await queue.bull.add("mystery-job", {});

    await waitFor(async () => (await queue.bull.getFailedCount()) === 2);
    expect(handler).not.toHaveBeenCalled();
    for (const job of await failedJobs()) expect(job.attemptsMade).toBe(1);
  });
});

describe("shutdown", () => {
  it("lets the job that is running finish before the worker closes", async () => {
    let started = false;
    let finished = false;
    run(
      handlersWith(async () => {
        started = true;
        await new Promise((resolve) => setTimeout(resolve, 300));
        finished = true;
        return sent;
      }),
    );
    await queue.enqueue("task-assigned", payload);
    await waitFor(() => started);

    await worker!.close(); // what a SIGTERM handler does

    expect(finished).toBe(true);
    expect(await queue.bull.getCompletedCount()).toBe(1);
  });
});
