import { describe, expect, it } from "vitest";
import { buildMeta } from "../../src/services/pagination.js";
import { slugify } from "../../src/services/slug.js";

describe("buildMeta", () => {
  it("computes the last page of 25 items at 10 per page", () => {
    expect(buildMeta(25, 3, 10)).toEqual({
      page: 3, limit: 10, total: 25, totalPages: 3, hasNext: false, hasPrev: true,
    });
  });

  it("handles an empty result", () => {
    expect(buildMeta(0, 1, 10)).toMatchObject({ totalPages: 0, hasNext: false, hasPrev: false });
  });

  it("reports a page past the end without pretending there is a next page", () => {
    expect(buildMeta(25, 99, 10)).toMatchObject({ totalPages: 3, hasNext: false, hasPrev: true });
  });
});

describe("slugify", () => {
  it("lowercases and joins words with dashes", () => {
    expect(slugify("My Project!")).toBe("my-project");
  });

  it("trims separators and collapses runs", () => {
    expect(slugify("  --Hello__World--  ")).toBe("hello-world");
  });

  it("falls back to a default when nothing usable is left", () => {
    expect(slugify("!!!")).toBe("project");
  });

  it("turns accented letters into plain ones", () => {
    expect(slugify("Ünïcode")).toBe("unicode");
  });

  it("caps the length", () => {
    expect(slugify("a".repeat(80))).toHaveLength(50);
  });
});