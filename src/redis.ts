import { Redis } from "ioredis";
import { config } from "./config.js";
import { logger } from "./logger.js";

const ERROR_LOG_INTERVAL_MS = 30_000;

export function createRedisClient(url: string): Redis {
  const client = new Redis(url, {
    lazyConnect: true, // connect explicitly, so startup order is visible
    enableOfflineQueue: false, // fail fast while disconnected instead of queueing commands
    maxRetriesPerRequest: 1,
    connectTimeout: 2_000,
    commandTimeout: 500, // a stuck Redis must never stall a request for long
    retryStrategy: (attempt) => Math.min(attempt * 200, 5_000), // keep trying in the background
  });

  // ioredis emits an "error" on every failed reconnect attempt. Log it, but not 5 times a second.
  let lastErrorLog = 0;
  client.on("error", (err: Error) => {
    const now = Date.now();
    if (now - lastErrorLog < ERROR_LOG_INTERVAL_MS) return;
    lastErrorLog = now;
    logger.warn(
      { event: "redis.error", err },
      "redis connection problem (logged at most every 30s)",
    );
  });
  client.on("ready", () => logger.info({ event: "redis.ready" }, "redis connected"));

  return client;
}

/** The shared client, or undefined when REDIS_URL is empty. */
export const redis: Redis | undefined = config.redisUrl
  ? createRedisClient(config.redisUrl)
  : undefined;

/** Resolves true when connected. Never throws: the app starts without Redis and keeps retrying. */
export async function connectRedis(): Promise<boolean> {
  if (!redis) return false;
  try {
    await redis.connect();
    return true;
  } catch (err) {
    logger.warn({ event: "redis.unavailable", err }, "starting without redis; will keep retrying");
    return false;
  }
}

export async function closeRedis(): Promise<void> {
  if (!redis) return;
  try {
    await redis.quit();
  } catch {
    redis.disconnect(); // not connected: just stop the retry loop
  }
}
