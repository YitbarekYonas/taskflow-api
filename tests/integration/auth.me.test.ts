import { describe, expect, it } from "vitest";
import { signAccessToken } from "../../src/auth/tokens.js";
import { prisma } from "../../src/db.js";
import { api } from "../support/app.js";
import { createUser } from "../support/factories.js";

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

describe("GET /auth/me", () => {
  it("returns the logged-in user", async () => {
    const user = await createUser({ email: "sam@example.com", name: "Sam" });

    const res = await api().get("/auth/me").set(bearer(await signAccessToken(user.id)));

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      id: user.id, email: "sam@example.com", name: "Sam", createdAt: expect.any(String),
    });
  });

  it("answers 401 with a WWW-Authenticate header when no token is sent", async () => {
    const res = await api().get("/auth/me");

    expect(res.status).toBe(401);
    expect(res.headers["www-authenticate"]).toContain("Bearer");
    expect(res.body).toEqual({ error: { message: "Authentication required." } });
  });

  it.each([
    ["a garbage token", "Bearer garbage"],
    ["the wrong scheme", "Basic dXNlcjpwYXNz"],
    ["a token with no scheme", "justatoken"],
    ["an empty bearer token", "Bearer "],
  ])("answers 401 for %s", async (_name, header) => {
    const res = await api().get("/auth/me").set("Authorization", header);

    expect(res.status).toBe(401);
    expect(res.body.error.message).toEqual(expect.any(String));
  });

  it("answers 401 for a perfectly valid token whose user no longer exists", async () => {
    const user = await createUser();
    const token = await signAccessToken(user.id);
    await prisma.user.delete({ where: { id: user.id } });

    const res = await api().get("/auth/me").set(bearer(token));

    expect(res.status).toBe(401);
  });
});