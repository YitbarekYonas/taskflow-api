import type { Redis } from "ioredis";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createCache } from "../../../src/cache/cache.js";

// A tiny in-memory stand-in for the parts of ioredis that the cache uses
function fakeRedis() {
  const store = new Map<string, string>();
  const ttls: number[] = [];
  const raw = {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, value: string, _mode: string, ttl: number) => {
      store.set(key, value);
      ttls.push(ttl);
      return "OK";
    }),
    multi: () => {
      const operations: Array<() => void> = [];
      const chain = {
        incr: (key: string) => {
          operations.push(() => store.set(key, String(Number(store.get(key) ?? 0) + 1)));
          return chain;
        },
        expire: () => chain,
        exec: async () => {
          operations.forEach((operation) => operation());
          return operations.map(() => [null, 1]);
        },
      };
      return chain;
    },
  };
  return { client: raw as unknown as Redis, raw, store, ttls };
}

const schema = z.object({ n: z.number() });
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Entry = { n: number };

// Builds the options for getOrCompute, with the value type fixed to { n: number }
function options(
  overrides: {
    namespace?: string;
    scope?: string;
    variant?: string;
    ttlSeconds?: number;
    compute?: () => Promise<Entry>;
  } = {},
) {
  return {
    namespace: "demo",
    scope: "thing:1",
    variant: "2026-01-01",
    ttlSeconds: 60,
    schema,
    compute: async (): Promise<Entry> => ({ n: 1 }),
    ...overrides,
  };
}

describe("without Redis", () => {
  it("computes every time and reports a bypass", async () => {
    const cache = createCache(undefined);
    const compute = vi.fn(async () => ({ n: 7 }));

    expect(await cache.getOrCompute(options({ compute }))).toEqual({
      value: { n: 7 },
      status: "bypass",
    });
    await cache.getOrCompute(options({ compute }));
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it("treats invalidation as a no-op", async () => {
    await expect(createCache(undefined).invalidate("demo", "thing:1")).resolves.toBeUndefined();
  });
});

describe("cache-aside", () => {
  it("computes once, then serves from the cache", async () => {
    const { client } = fakeRedis();
    const cache = createCache(client);
    const compute = vi.fn(async () => ({ n: 42 }));

    const first = await cache.getOrCompute(options({ compute }));
    const second = await cache.getOrCompute(options({ compute }));

    expect(first).toEqual({ value: { n: 42 }, status: "miss" });
    expect(second).toEqual({ value: { n: 42 }, status: "hit" });
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it("stores JSON under a key made of format, namespace, scope, generation and variant", async () => {
    const { client, store } = fakeRedis();
    await createCache(client).getOrCompute(options());

    expect([...store.keys()]).toEqual(["cache:v1:demo:thing:1:0:2026-01-01"]);
    expect(JSON.parse(store.get("cache:v1:demo:thing:1:0:2026-01-01")!)).toEqual({ n: 1 });
  });

  it("keeps different scopes and different variants apart", async () => {
    const { client } = fakeRedis();
    const cache = createCache(client);
    await cache.getOrCompute(options({ compute: async () => ({ n: 1 }) }));

    const otherScope = await cache.getOrCompute(
      options({ scope: "thing:2", compute: async () => ({ n: 2 }) }),
    );
    const otherDay = await cache.getOrCompute(
      options({ variant: "2026-01-02", compute: async () => ({ n: 3 }) }),
    );

    expect(otherScope).toEqual({ value: { n: 2 }, status: "miss" });
    expect(otherDay).toEqual({ value: { n: 3 }, status: "miss" });
  });

  it("recomputes after invalidation, under a new generation", async () => {
    const { client, store } = fakeRedis();
    const cache = createCache(client);
    await cache.getOrCompute(options({ compute: async () => ({ n: 1 }) }));

    await cache.invalidate("demo", "thing:1");
    const after = await cache.getOrCompute(options({ compute: async () => ({ n: 2 }) }));

    expect(after).toEqual({ value: { n: 2 }, status: "miss" });
    expect(store.has("cache:v1:demo:thing:1:1:2026-01-01")).toBe(true);
  });

  it("does not invalidate other scopes", async () => {
    const { client } = fakeRedis();
    const cache = createCache(client);
    await cache.getOrCompute(options({ scope: "thing:2", compute: async () => ({ n: 2 }) }));

    await cache.invalidate("demo", "thing:1");

    expect((await cache.getOrCompute(options({ scope: "thing:2" }))).status).toBe("hit");
  });

  it("stores a stale result under a dead generation when a write happens during the computation", async () => {
    const { client } = fakeRedis();
    const cache = createCache(client);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));

    // The reader reads generation 0, then starts computing from "old" data
    const slowReader = cache.getOrCompute(
      options({
        compute: async () => {
          await gate;
          return { n: 1 }; // the old answer
        },
      }),
    );
    await sleep(10);
    await cache.invalidate("demo", "thing:1"); // the writer commits and invalidates meanwhile
    release();

    expect((await slowReader).value).toEqual({ n: 1 }); // the old caller still gets its own answer
    const next = await cache.getOrCompute(options({ compute: async () => ({ n: 2 }) }));
    expect(next).toEqual({ value: { n: 2 }, status: "miss" }); // and nobody ever reads the stale one
  });
});

describe("entries that cannot be trusted", () => {
  it.each([
    ["is not JSON", "not json at all"],
    ["has the wrong shape", JSON.stringify({ unexpected: true })],
  ])("treats an entry that %s as a miss and overwrites it", async (_name, garbage) => {
    const { client, store } = fakeRedis();
    store.set("cache:v1:demo:thing:1:0:2026-01-01", garbage);

    const result = await createCache(client).getOrCompute(
      options({ compute: async () => ({ n: 5 }) }),
    );

    expect(result).toEqual({ value: { n: 5 }, status: "miss" });
    expect(JSON.parse(store.get("cache:v1:demo:thing:1:0:2026-01-01")!)).toEqual({ n: 5 });
  });
});

describe("stampedes", () => {
  it("runs one computation for many simultaneous misses", async () => {
    const { client } = fakeRedis();
    const cache = createCache(client);
    const compute = vi.fn<() => Promise<Entry>>(async () => {
      await sleep(30);
      return { n: 9 };
    });

    const results = await Promise.all(
      Array.from({ length: 20 }, () => cache.getOrCompute(options({ compute }))),
    );

    expect(compute).toHaveBeenCalledTimes(1);
    expect(results.every((r) => r.value.n === 9)).toBe(true);
  });

  it("does not share a computation between different keys", async () => {
    const { client } = fakeRedis();
    const cache = createCache(client);
    const compute = vi.fn<() => Promise<Entry>>(async () => {
      await sleep(10);
      return { n: 1 };
    });

    await Promise.all([
      cache.getOrCompute(options({ scope: "thing:1", compute })),
      cache.getOrCompute(options({ scope: "thing:2", compute })),
    ]);

    expect(compute).toHaveBeenCalledTimes(2);
  });

  it("shares a failure with everyone waiting, does not cache it, and tries again next time", async () => {
    const { client } = fakeRedis();
    const cache = createCache(client);
    const compute = vi
      .fn<() => Promise<Entry>>()
      .mockImplementationOnce(async () => {
        await sleep(20);
        throw new Error("database exploded");
      })
      .mockResolvedValue({ n: 3 });

    const failed = await Promise.allSettled(
      Array.from({ length: 3 }, () => cache.getOrCompute(options({ compute }))),
    );

    expect(failed.every((r) => r.status === "rejected")).toBe(true);
    expect(compute).toHaveBeenCalledTimes(1);
    expect((await cache.getOrCompute(options({ compute }))).value).toEqual({ n: 3 });
  });

  it("spreads expiry times with jitter, always within 10% of the TTL", async () => {
    const { client, ttls } = fakeRedis();
    const cache = createCache(client);

    for (let i = 0; i < 40; i++) await cache.getOrCompute(options({ variant: `day-${i}` }));

    expect(ttls.every((ttl) => ttl >= 54 && ttl <= 66)).toBe(true);
    expect(new Set(ttls).size).toBeGreaterThan(1);
  });
});

describe("when Redis fails", () => {
  it("answers from the computation instead of failing, when reading fails", async () => {
    const { client, raw } = fakeRedis();
    raw.get.mockRejectedValue(new Error("redis down"));

    const result = await createCache(client).getOrCompute(
      options({ compute: async () => ({ n: 8 }) }),
    );

    expect(result).toEqual({ value: { n: 8 }, status: "bypass" });
  });

  it("still returns the computed answer when only storing it fails", async () => {
    const { client, raw } = fakeRedis();
    raw.set.mockRejectedValue(new Error("redis down"));

    const result = await createCache(client).getOrCompute(
      options({ compute: async () => ({ n: 4 }) }),
    );

    expect(result).toEqual({ value: { n: 4 }, status: "miss" });
  });

  it("never throws from invalidate", async () => {
    const broken = {
      multi: () => {
        throw new Error("redis down");
      },
    } as unknown as Redis;

    await expect(createCache(broken).invalidate("demo", "thing:1")).resolves.toBeUndefined();
  });
});
