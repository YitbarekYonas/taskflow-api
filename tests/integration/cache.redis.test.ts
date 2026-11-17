import { Redis } from "ioredis";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { createCache } from "../../src/cache/cache.js";
import { TEST_REDIS_URL } from "../support/env.js";
import { assertTestRedis } from "../support/redis.js";

assertTestRedis();
const client = new Redis(TEST_REDIS_URL);
const cache = createCache(client);
const schema = z.object({ n: z.number() });
const entry = { namespace: "demo", scope: "thing:1", variant: "v", ttlSeconds: 60, schema };

beforeEach(async () => {
  await client.flushdb();
});
afterAll(() => {
  client.disconnect();
});

describe("the cache against a real Redis", () => {
  it("round-trips a value and expires it close to the configured TTL", async () => {
    await cache.getOrCompute({ ...entry, compute: async () => ({ n: 5 }) });

    const [key] = await client.keys("cache:v1:*");
    expect(JSON.parse((await client.get(key)) ?? "")).toEqual({ n: 5 });
    const ttl = await client.ttl(key);
    expect(ttl).toBeGreaterThanOrEqual(54);
    expect(ttl).toBeLessThanOrEqual(66);
  });

  it("serves the stored value on the next call", async () => {
    await cache.getOrCompute({ ...entry, compute: async () => ({ n: 5 }) });

    const second = await cache.getOrCompute({ ...entry, compute: async () => ({ n: 99 }) });

    expect(second).toEqual({ value: { n: 5 }, status: "hit" });
  });

  it("invalidates by bumping a generation counter that itself expires after a day", async () => {
    await cache.getOrCompute({ ...entry, compute: async () => ({ n: 1 }) });

    await cache.invalidate("demo", "thing:1");

    expect(await client.get("cache:ver:demo:thing:1")).toBe("1");
    const ttl = await client.ttl("cache:ver:demo:thing:1");
    expect(ttl).toBeGreaterThan(86_000);
    const after = await cache.getOrCompute({ ...entry, compute: async () => ({ n: 2 }) });
    expect(after).toEqual({ value: { n: 2 }, status: "miss" });
    expect(await client.keys("cache:v1:demo:thing:1:1:*")).toHaveLength(1);
  });

  it("never lets a stale entry from a previous generation be read", async () => {
    await cache.getOrCompute({ ...entry, compute: async () => ({ n: 1 }) });
    await cache.invalidate("demo", "thing:1");
    await cache.invalidate("demo", "thing:1");

    const result = await cache.getOrCompute({ ...entry, compute: async () => ({ n: 3 }) });

    expect(result).toEqual({ value: { n: 3 }, status: "miss" });
    expect(await client.keys("cache:v1:demo:thing:1:*")).toHaveLength(2); // the old one is still there, unreachable
  });
});
