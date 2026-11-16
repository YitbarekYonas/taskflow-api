import { UnrecoverableError, Worker } from "bullmq";
import type { RedisOptions } from "ioredis";
import { logger } from "../logger.js";
import { throttled } from "../throttle.js";
import { jobSchemas, QUEUE_NAME, type JobName } from "./definitions.js";
import type { Handlers } from "./handlers.js";
import { toBullConnection } from "./queue.js";

// Failures that will happen again however often we retry: an SMTP 5xx answer, or no valid recipient
function isPermanent(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const { responseCode, code } = error as { responseCode?: unknown; code?: unknown };
  return (
    (typeof responseCode === "number" && responseCode >= 500 && responseCode < 600) ||
    code === "EENVELOPE"
  );
}

export function startWorker(options: {
  connection: RedisOptions;
  handlers: Handlers;
  concurrency?: number;
  prefix?: string;
}) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      if (!(job.name in jobSchemas)) throw new UnrecoverableError(`unknown job type "${job.name}"`);
      const name = job.name as JobName;

      // A malformed payload fails the same way on every attempt, so do not retry it
      const parsed = jobSchemas[name].safeParse(job.data);
      if (!parsed.success) throw new UnrecoverableError("invalid job payload"); // never log the payload itself

      try {
        return await (options.handlers[name] as (payload: unknown) => Promise<unknown>)(
          parsed.data,
        );
      } catch (error) {
        if (isPermanent(error)) {
          throw new UnrecoverableError(
            `permanent failure: ${error instanceof Error ? error.message : "unknown"}`,
          );
        }
        throw error; // anything else is treated as temporary: BullMQ retries with backoff
      }
    },
    {
      // Workers wait for jobs on a blocking connection: ioredis must never give up on a command
      connection: { ...toBullConnection(options.connection), maxRetriesPerRequest: null },
      concurrency: options.concurrency ?? 5,
      ...(options.prefix ? { prefix: options.prefix } : {}),
    },
  );

  worker.on("error", (err) =>
    throttled("worker-error", 30_000, () =>
      logger.warn(
        { event: "worker.error", err },
        "worker connection problem (logged at most every 30s)",
      ),
    ),
  );
  worker.on("completed", (job, result) =>
    logger.info({ event: "job.completed", job: job.name, jobId: job.id, result }, "job completed"),
  );
  worker.on("failed", (job, err) => {
    if (!job) return;
    const finalFailure =
      err instanceof UnrecoverableError || job.attemptsMade >= (job.opts.attempts ?? 1);
    logger[finalFailure ? "error" : "warn"](
      {
        event: finalFailure ? "job.failed_permanently" : "job.will_retry",
        job: job.name,
        jobId: job.id,
        attempt: job.attemptsMade,
        err,
      },
      finalFailure ? "job failed and will not be retried" : "job failed, will retry with backoff",
    );
  });

  return worker;
}
