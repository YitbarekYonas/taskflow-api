import { describe, expect, it } from "vitest";
import { prisma } from "../../src/db.js";
import { createUser } from "../support/factories.js";

describe("test infrastructure", () => {
  it("runs against a database whose name ends with _test", async () => {
    const [{ db }] = await prisma.$queryRaw<{ db: string }[]>`SELECT current_database() AS db`;
    expect(db.endsWith("_test")).toBe(true);
  });

  it("applied every migration", async () => {
    const [{ n }] = await prisma.$queryRaw<
      { n: number }[]
    >`SELECT count(*)::int AS n FROM _prisma_migrations`;
    expect(n).toBeGreaterThan(0);
  });

  it("starts each test with empty tables (first half)", async () => {
    expect(await prisma.user.count()).toBe(0);
    await createUser();
    expect(await prisma.user.count()).toBe(1);
  });

  it("starts each test with empty tables (second half: the user above is gone)", async () => {
    expect(await prisma.user.count()).toBe(0);
  });

  it("restarts id counters, so ids are predictable inside a test", async () => {
    const user = await createUser();
    expect(user.id).toBe(1);
  });
});
