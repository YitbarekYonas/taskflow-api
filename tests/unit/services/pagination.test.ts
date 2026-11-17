import { describe, expect, it } from "vitest";
import { buildMeta } from "../../../src/services/pagination.js";

describe("buildMeta", () => {
  it.each([
    {
      name: "first page",
      total: 25,
      page: 1,
      limit: 10,
      expected: { totalPages: 3, hasNext: true, hasPrev: false },
    },
    {
      name: "middle page",
      total: 25,
      page: 2,
      limit: 10,
      expected: { totalPages: 3, hasNext: true, hasPrev: true },
    },
    {
      name: "last page",
      total: 25,
      page: 3,
      limit: 10,
      expected: { totalPages: 3, hasNext: false, hasPrev: true },
    },
    {
      name: "exactly one full page",
      total: 10,
      page: 1,
      limit: 10,
      expected: { totalPages: 1, hasNext: false, hasPrev: false },
    },
    {
      name: "an empty result",
      total: 0,
      page: 1,
      limit: 10,
      expected: { totalPages: 0, hasNext: false, hasPrev: false },
    },
    {
      name: "a page past the end",
      total: 25,
      page: 99,
      limit: 10,
      expected: { totalPages: 3, hasNext: false, hasPrev: true },
    },
  ])("$name", ({ total, page, limit, expected }) => {
    expect(buildMeta(total, page, limit)).toEqual({ page, limit, total, ...expected });
  });
});
