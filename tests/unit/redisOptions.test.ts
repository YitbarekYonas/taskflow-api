import { describe, expect, it } from "vitest";
import { redisConnectionOptions } from "../../src/redis.js";

describe("redisConnectionOptions", () => {
  it.each([
    ["redis://localhost:6379", { host: "localhost", port: 6379, db: 0 }],
    ["redis://localhost", { host: "localhost", port: 6379, db: 0 }],
    ["redis://cache.internal:6380/15", { host: "cache.internal", port: 6380, db: 15 }],
    ["redis://:s3cret%21@host:6379/2", { host: "host", port: 6379, db: 2, password: "s3cret!" }],
    ["redis://app:pw@host:6379", { host: "host", username: "app", password: "pw", db: 0 }],
  ])("parses %s", (url, expected) => {
    expect(redisConnectionOptions(url)).toMatchObject(expected);
  });

  it("turns on TLS for rediss://", () => {
    expect(redisConnectionOptions("rediss://host:6380")).toHaveProperty("tls");
  });
});
