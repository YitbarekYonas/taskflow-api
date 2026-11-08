import { describe, expect, it } from "vitest";
import { hashRefreshToken } from "../../src/auth/refreshTokens.js";
import { verifyAccessToken } from "../../src/auth/tokens.js";
import { config } from "../../src/config.js";
import { prisma } from "../../src/db.js";
import { api } from "../support/app.js";
import { createUser, TEST_PASSWORD } from "../support/factories.js";

const login = (email: string, password: string) => api().post("/auth/login").send({ email, password });

describe("POST /auth/login", () => {
  it("returns an access token, a refresh token and the public user", async () => {
    const user = await createUser({ email: "sam@example.com", name: "Sam" });

    const res = await login("sam@example.com", TEST_PASSWORD);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      tokenType: "Bearer",
      expiresIn: config.accessTokenTtl,
      refreshExpiresIn: config.refreshTokenTtlDays * 86_400,
      user: { id: user.id, email: "sam@example.com", name: "Sam", createdAt: expect.any(String) },
    });
    expect(JSON.stringify(res.body).toLowerCase()).not.toContain("passwordhash");
    expect(res.headers["cache-control"]).toContain("no-store");
  });

  it("issues an access token that identifies the user", async () => {
    const user = await createUser();
    const res = await login(user.email, TEST_PASSWORD);

    expect(await verifyAccessToken(res.body.data.accessToken)).toBe(user.id);
  });

  it("stores only a hash of the refresh token, with the configured lifetime", async () => {
    const user = await createUser();
    const res = await login(user.email, TEST_PASSWORD);
    const refreshToken: string = res.body.data.refreshToken;

    expect(refreshToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const rows = await prisma.refreshToken.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0].tokenHash).toBe(hashRefreshToken(refreshToken));
    expect(rows[0].tokenHash).not.toBe(refreshToken);
    expect(rows[0].userId).toBe(user.id);
    expect(rows[0].usedAt).toBeNull();
    expect(rows[0].revokedAt).toBeNull();

    const expected = Date.now() + config.refreshTokenTtlDays * 86_400_000;
    expect(Math.abs(rows[0].expiresAt.getTime() - expected)).toBeLessThan(60_000);
  });

  it("starts an independent session family on every login", async () => {
    const user = await createUser();
    await login(user.email, TEST_PASSWORD);
    await login(user.email, TEST_PASSWORD);

    const rows = await prisma.refreshToken.findMany();
    expect(new Set(rows.map((r) => r.familyId)).size).toBe(2);
  });

  it("ignores the letter case of the email", async () => {
    await createUser({ email: "sam@example.com" });
    expect((await login("  SAM@Example.com ", TEST_PASSWORD)).status).toBe(200);
  });

  describe("failures never reveal which half was wrong", () => {
    it("gives an identical 401 for an unknown email and a wrong password", async () => {
      const user = await createUser();

      const wrongPassword = await login(user.email, "not-the-password");
      const unknownEmail = await login("nobody@example.com", "not-the-password");

      expect(wrongPassword.status).toBe(401);
      expect(unknownEmail.status).toBe(401);
      expect(unknownEmail.body).toEqual(wrongPassword.body);
      expect(wrongPassword.body.error.message).toBe("Invalid email or password.");
      expect(wrongPassword.headers["www-authenticate"]).toContain("Bearer");
      expect(unknownEmail.headers["www-authenticate"]).toBe(wrongPassword.headers["www-authenticate"]);
    });

    it("gives the same answer for an account with an unusable password hash", async () => {
      await createUser({ email: "legacy@example.com", passwordHash: "!" });

      const res = await login("legacy@example.com", TEST_PASSWORD);

      expect(res.status).toBe(401);
      expect(res.body.error.message).toBe("Invalid email or password.");
    });

    it("does not trim or alter the password", async () => {
      const user = await createUser();
      expect((await login(user.email, ` ${TEST_PASSWORD}`)).status).toBe(401);
      expect((await login(user.email, TEST_PASSWORD.toUpperCase())).status).toBe(401);
    });

    it("creates no session when the login fails", async () => {
      const user = await createUser();
      await login(user.email, "not-the-password");
      await login("nobody@example.com", "not-the-password");

      expect(await prisma.refreshToken.count()).toBe(0);
    });
  });

  it.each([
    ["a missing password", { email: "sam@example.com" }],
    ["a missing email", { password: "x" }],
    ["an unknown field", { email: "sam@example.com", password: "x", admin: true }],
    ["an empty object", {}],
  ])("rejects %s with 400", async (_name, body) => {
    const res = await api().post("/auth/login").send(body);

    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe("Validation failed");
  });
});