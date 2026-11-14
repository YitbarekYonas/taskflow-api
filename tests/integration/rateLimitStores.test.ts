import { Redis } from "ioredis";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { RedisCounterStore } from "../../src/middleware/rateLimitStores.js";
import { TEST_REDIS_URL } from "../support/env.js";
import { assertTestRedis } from "../support/redis.js";

assertTestRedis();
const client = new Redis(TEST_REDIS_URL);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function storeWith(windowMs: number, prefix = "t:") {
  const store = new RedisCounterStore(client, prefix);
  store.init({ windowMs });
  return store;
}

beforeEach(async () => {
  await client.flushdb();
});
afterAll(() => {
  client.disconnect();
});

describe("RedisCounterStore", () => {
  it("counts hits and reports when the window resets", async () => {
    const store = storeWith(5_000);

    expect((await store.increment("a")).totalHits).toBe(1);
    expect((await store.increment("a")).totalHits).toBe(2);
    const third = await store.increment("a");

    expect(third.totalHits).toBe(3);
    const msUntilReset = third.resetTime!.getTime() - Date.now();
    expect(msUntilReset).toBeGreaterThan(0);
    expect(msUntilReset).toBeLessThanOrEqual(5_000);
  });

  it("starts the window on the first hit and does not extend it on later ones", async () => {
    const store = storeWith(5_000);
    await store.increment("a");
    const first = await client.pttl("t:a");
    await sleep(150);

    await store.increment("a");

    expect(await client.pttl("t:a")).toBeLessThan(first - 100);
  });

  it("starts a fresh window after the old one expires", async () => {
    const store = storeWith(300);
    await store.increment("a");
    expect((await store.increment("a")).totalHits).toBe(2);

    await sleep(400);

    expect((await store.increment("a")).totalHits).toBe(1);
  });

  it("never loses a hit when many requests arrive at once", async () => {
    const store = storeWith(5_000);

    const results = await Promise.all(Array.from({ length: 50 }, () => store.increment("a")));

    expect(results.map((r) => r.totalHits).sort((x, y) => x - y)).toEqual(
      Array.from({ length: 50 }, (_, i) => i + 1),
    );
  });

  it("always leaves an expiry on the key", async () => {
    const store = storeWith(5_000);
    await store.increment("a");
    await store.decrement("a");
    await store.increment("a");

    expect(await client.pttl("t:a")).toBeGreaterThan(0);
  });

  it("decrements an existing counter", async () => {
    const store = storeWith(5_000);
    await store.increment("a");
    await store.increment("a");
    await store.increment("a");

    await store.decrement("a");

    expect((await store.increment("a")).totalHits).toBe(3);
  });

  it("does not resurrect a missing key when decrementing", async () => {
    const store = storeWith(5_000);

    await store.decrement("never-existed");

    expect(await client.exists("t:never-existed")).toBe(0);
  });

  it("forgets a key on reset", async () => {
    const store = storeWith(5_000);
    await store.increment("a");

    await store.resetKey("a");

    expect((await store.increment("a")).totalHits).toBe(1);
  });

  it("keeps different prefixes apart", async () => {
    const one = storeWith(5_000, "one:");
    const two = storeWith(5_000, "two:");
    await one.increment("same");
    await one.increment("same");

    expect((await two.increment("same")).totalHits).toBe(1);
  });
});
