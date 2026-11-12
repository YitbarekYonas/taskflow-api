import { beforeAll, describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../../../src/auth/password.js";

describe("passwords", () => {
  const PASSWORD = "correct-horse-battery";
  let hash: string;

  beforeAll(async () => {
    hash = await hashPassword(PASSWORD); // hashing is slow on purpose, so do it once
  });

  it("stores an Argon2id hash, never the password", () => {
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(hash).not.toContain(PASSWORD);
  });

  it("accepts the right password and rejects a wrong one", async () => {
    expect(await verifyPassword(hash, PASSWORD)).toBe(true);
    expect(await verifyPassword(hash, "wrong-horse-battery")).toBe(false);
  });

  it("is case sensitive and does not trim", async () => {
    expect(await verifyPassword(hash, PASSWORD.toUpperCase())).toBe(false);
    expect(await verifyPassword(hash, ` ${PASSWORD} `)).toBe(false);
  });

  it("uses a fresh random salt each time", async () => {
    expect(await hashPassword(PASSWORD)).not.toBe(hash);
  });

  it.each(["!", "", "not-a-hash", "$argon2id$garbage"])(
    "treats the unusable stored value %j as a failed login, never an exception",
    async (stored) => {
      await expect(verifyPassword(stored, PASSWORD)).resolves.toBe(false);
    },
  );
});
