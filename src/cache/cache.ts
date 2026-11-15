import type { Redis } from "ioredis";
import type { z } from "zod";
import { logger } from "../logger.js";

export type CacheStatus = "hit" | "miss" | "bypass";

type GetOrComputeOptions<T> = {
  namespace: string; // what kind of data, e.g. "project-stats"
  scope: string; // which thing it belongs to, e.g. "project:12"
  variant: string; // every other input the answer depends on, e.g. the date
  ttlSeconds: number; // the maximum staleness if an invalidation is ever missed
  schema: z.ZodType<T>; // what a stored entry must look like to be trusted
  compute: () => Promise<T>;
};

const KEY_FORMAT = "v1"; // bump when the cached shape changes: old entries are then never read
const VERSION_TTL_SECONDS = 86_400; // far longer than any entry lives, so a version never resets while data exists
const WARN_INTERVAL_MS = 30_000;

export function createCache(client: Redis | undefined) {
  // Concurrent misses for the same key share ONE computation (per process)
  const inFlight = new Map<string, Promise<unknown>>();
  let lastWarning = 0;

  function warn(operation: string, err: unknown) {
    const now = Date.now();
    if (now - lastWarning < WARN_INTERVAL_MS) return;
    lastWarning = now;
    logger.warn(
      { event: "cache.error", operation, err },
      "cache unavailable: answering from the database (logged at most every 30s)",
    );
  }

  const versionKey = (namespace: string, scope: string) => `cache:ver:${namespace}:${scope}`;
  const dataKey = (namespace: string, scope: string, version: number, variant: string) =>
    `cache:${KEY_FORMAT}:${namespace}:${scope}:${version}:${variant}`;

  // +-10% so entries written together do not all expire together
  const withJitter = (seconds: number) =>
    Math.max(1, Math.round(seconds * (0.9 + Math.random() * 0.2)));

  function parseJson(raw: string): unknown {
    try {
      return JSON.parse(raw);
    } catch {
      return undefined;
    }
  }

  async function getOrCompute<T>(
    options: GetOrComputeOptions<T>,
  ): Promise<{ value: T; status: CacheStatus }> {
    if (!client) return { value: await options.compute(), status: "bypass" };

    let key: string;
    try {
      // 1. Read the generation FIRST. Everything stored below goes under THIS generation.
      const version = Number((await client.get(versionKey(options.namespace, options.scope))) ?? 0);
      key = dataKey(options.namespace, options.scope, version, options.variant);

      const raw = await client.get(key);
      if (raw !== null) {
        const parsed = options.schema.safeParse(parseJson(raw));
        if (parsed.success) return { value: parsed.data, status: "hit" };
        // unreadable or old-shaped entry: treat as a miss and overwrite it
      }
    } catch (err) {
      warn("read", err);
      return { value: await options.compute(), status: "bypass" };
    }

    // 2. Miss. Join a computation that is already running for this exact key, or start one.
    const running = inFlight.get(key) as Promise<T> | undefined;
    if (running) return { value: await running, status: "miss" };

    const computation = (async () => {
      const value = await options.compute();
      try {
        await client.set(key, JSON.stringify(value), "EX", withJitter(options.ttlSeconds));
      } catch (err) {
        warn("write", err); // the caller still gets the computed answer
      }
      return value;
    })();

    inFlight.set(key, computation);
    try {
      return { value: await computation, status: "miss" };
    } finally {
      inFlight.delete(key);
    }
  }

  /**
   * Make every entry of this scope unreachable. Call it AFTER the database write has committed.
   * Never throws: a write must not fail because the cache is down (the TTL bounds the staleness).
   */
  async function invalidate(namespace: string, scope: string): Promise<void> {
    if (!client) return;
    try {
      const key = versionKey(namespace, scope);
      const results = await client.multi().incr(key).expire(key, VERSION_TTL_SECONDS).exec();
      if (!results || results.some(([error]) => error))
        warn("invalidate", new Error("transaction failed"));
    } catch (err) {
      warn("invalidate", err);
    }
  }

  return { getOrCompute, invalidate };
}

export type Cache = ReturnType<typeof createCache>;
