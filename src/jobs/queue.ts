import { Queue } from "bullmq";
import type { RedisOptions } from "ioredis";
import { logger } from "../logger.js";
import { throttled } from "../throttle.js";
import { jobSchemas, QUEUE_NAME, type JobName, type JobPayloads } from "./definitions.js";
import type { Handlers } from "./handlers.js";

// BullMQ's ConnectionOptions is stricter than ioredis's RedisOptions (their retryStrategy types
// differ in newer ioredis). We only pass what BullMQ actually uses on a connection.
export type BullConnection = Pick<
  RedisOptions,
  "host" | "port" | "username" | "password" | "db" | "tls"
>;

/** Narrows a RedisOptions to the fields BullMQ reads, so its overload accepts the spread. */
export function toBullConnection(opts: RedisOptions): BullConnection {
  const { host, port, username, password, db, tls } = opts;
  return { host, port, username, password, db, ...(tls ? { tls } : {}) };
}

export interface JobQueue {
  enqueue<K extends JobName>(name: K, payload: JobPayloads[K]): Promise<void>;
  close(): Promise<void>;
}

type BullOptions = {
  connection: RedisOptions;
  attempts?: number;
  backoffDelayMs?: number;
  prefix?: string;
};

/** Puts jobs in Redis for a worker process to run. Connects on first use. */
export class BullJobQueue implements JobQueue {
  private queue: Queue | undefined;

  constructor(private readonly options: BullOptions) {}

  /** The underlying BullMQ queue (for tests and the operations script) */
  get bull(): Queue {
    if (!this.queue) {
      const queue = new Queue(QUEUE_NAME, {
        // A producer must fail fast when Redis is away: the API must not hang on a notification
        connection: { ...toBullConnection(this.options.connection), enableOfflineQueue: false },
        ...(this.options.prefix ? { prefix: this.options.prefix } : {}),
        defaultJobOptions: {
          attempts: this.options.attempts ?? 5, // the first run counts as an attempt
          backoff: { type: "exponential", delay: this.options.backoffDelayMs ?? 5_000 },
          removeOnComplete: { age: 3_600, count: 1_000 },
          // Redis never evicts (noeviction), so everything we keep needs a bound
          removeOnFail: { age: 7 * 86_400, count: 5_000 },
        },
      });
      queue.on("error", (err) =>
        throttled("queue-error", 30_000, () =>
          logger.warn(
            { event: "queue.error", err },
            "queue connection problem (logged at most every 30s)",
          ),
        ),
      );
      this.queue = queue;
    }
    return this.queue;
  }

  async enqueue<K extends JobName>(name: K, payload: JobPayloads[K]): Promise<void> {
    jobSchemas[name].parse(payload); // a bad payload is a bug in the producer: fail here, loudly
    await this.bull.add(name, payload);
  }

  async close(): Promise<void> {
    await this.queue?.close();
  }
}

/** Runs the handler immediately, in this process. For tests, and for development without a worker. */
export class InlineJobQueue implements JobQueue {
  constructor(private readonly handlers: Handlers) {}

  async enqueue<K extends JobName>(name: K, payload: JobPayloads[K]): Promise<void> {
    const parsed = jobSchemas[name].parse(payload) as JobPayloads[K];
    try {
      await (this.handlers[name] as (p: JobPayloads[K]) => Promise<unknown>)(parsed);
    } catch (err) {
      // In queue mode a failure is retried by the worker. Here it is logged and never fails the request.
      logger.warn(
        { event: "job.inline_failed", job: name, err },
        "inline job failed (queue mode would retry it)",
      );
    }
  }

  async close(): Promise<void> {}
}

export class NoopJobQueue implements JobQueue {
  async enqueue(): Promise<void> {}
  async close(): Promise<void> {}
}
