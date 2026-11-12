import { describe, expect, it } from "vitest";
import {
  generateRefreshToken,
  hashRefreshToken,
  newFamilyId,
} from "../../../src/auth/refreshTokens.js";

describe("refresh token helpers", () => {
  it("generates 256 bits as 43 URL-safe characters", () => {
    expect(generateRefreshToken()).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("never repeats", () => {
    const tokens = new Set(Array.from({ length: 500 }, generateRefreshToken));
    expect(tokens.size).toBe(500);
  });

  it("hashes to SHA-256 (known answer for 'abc')", () => {
    expect(hashRefreshToken("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("hashes deterministically and differently for different input", () => {
    expect(hashRefreshToken("one")).toBe(hashRefreshToken("one"));
    expect(hashRefreshToken("one")).not.toBe(hashRefreshToken("two"));
  });

  it("never stores the token itself", () => {
    const token = generateRefreshToken();
    expect(hashRefreshToken(token)).not.toContain(token);
    expect(hashRefreshToken(token)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("creates distinct family ids", () => {
    expect(newFamilyId()).not.toBe(newFamilyId());
  });
});
