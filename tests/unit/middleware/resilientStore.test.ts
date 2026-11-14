import type { Store } from "express-rate-limit";
import { describe, expect, it, vi } from "vitest";
import { ResilientStore } from "../../../src/middleware/rateLimitStores.js";

function fakeStore(hits = 1): Store {
  return {
    init: vi.fn(),
    increment: vi.fn(async () => ({ totalHits: hits, resetTime: undefined })),
    decrement: vi.fn(async () => {}),
    resetKey: vi.fn(async () => {}),
  };
}

describe("ResilientStore", () => {
  it("uses the primary store and leaves the fallback alone while the primary works", async () => {
    const primary = fakeStore(7);
    const fallback = fakeStore(1);
    const onFallback = vi.fn();
    const store = new ResilientStore(primary, fallback, onFallback);

    expect((await store.increment("k")).totalHits).toBe(7);
    expect(fallback.increment).not.toHaveBeenCalled();
    expect(onFallback).not.toHaveBeenCalled();
  });

  it("falls back, and reports which operation failed, when the primary throws", async () => {
    const primary = fakeStore();
    vi.mocked(primary.increment).mockRejectedValue(new Error("redis down"));
    const fallback = fakeStore(3);
    const onFallback = vi.fn();
    const store = new ResilientStore(primary, fallback, onFallback);

    expect((await store.increment("k")).totalHits).toBe(3);
    expect(onFallback).toHaveBeenCalledWith(expect.any(Error), "increment");
  });

  it("returns to the primary as soon as it works again", async () => {
    const primary = fakeStore(9);
    vi.mocked(primary.increment).mockRejectedValueOnce(new Error("blip"));
    const store = new ResilientStore(primary, fakeStore(1), vi.fn());

    expect((await store.increment("k")).totalHits).toBe(1); // fallback during the blip
    expect((await store.increment("k")).totalHits).toBe(9); // primary again
  });

  it("covers decrement and reset the same way", async () => {
    const primary = fakeStore();
    vi.mocked(primary.decrement).mockRejectedValue(new Error("down"));
    vi.mocked(primary.resetKey).mockRejectedValue(new Error("down"));
    const fallback = fakeStore();
    const store = new ResilientStore(primary, fallback, vi.fn());

    await store.decrement("k");
    await store.resetKey("k");

    expect(fallback.decrement).toHaveBeenCalledWith("k");
    expect(fallback.resetKey).toHaveBeenCalledWith("k");
  });

  it("passes the window settings to both stores", () => {
    const primary = fakeStore();
    const fallback = fakeStore();
    new ResilientStore(primary, fallback, vi.fn()).init({ windowMs: 1234 } as never);

    expect(primary.init).toHaveBeenCalled();
    expect(fallback.init).toHaveBeenCalled();
  });
});
