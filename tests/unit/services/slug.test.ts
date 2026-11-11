import { describe, expect, it, vi } from "vitest";
import { makeSlug, slugify } from "../../../src/services/slug.js";

vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  return { ...actual, randomBytes: () => Buffer.from([0xab, 0xcd, 0xef]) };
});

describe("slugify", () => {
  it.each([
    ["My Project!", "my-project"],
    ["  --Hello__World--  ", "hello-world"],
    ["Several   spaces", "several-spaces"],
    ["Ünïcode", "unicode"],
    ["!!!", "project"],
    ["", "project"],
  ])("turns %j into %j", (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });

  it("caps the length at 50 characters", () => {
    expect(slugify("a".repeat(80))).toHaveLength(50);
  });

  it("never ends with a separator, even when the cut lands on one", () => {
    const slug = slugify("a".repeat(49) + " b");
    expect(slug).toHaveLength(49);
    expect(slug).not.toMatch(/-$/);
  });
});

describe("makeSlug", () => {
  it("appends the random suffix", () => {
    expect(makeSlug("My Project")).toBe("my-project-abcdef");
  });

  it("keeps a usable slug for names with no letters", () => {
    expect(makeSlug("!!!")).toBe("project-abcdef");
  });

  it("only produces URL-safe characters", () => {
    expect(makeSlug("Ünïcode & Friends")).toMatch(/^[a-z0-9-]+$/);
  });
});
