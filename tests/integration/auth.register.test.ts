import { describe, expect, it } from "vitest";
import { prisma } from "../../src/db.js";
import { api } from "../support/app.js";
import { TEST_PASSWORD } from "../support/factories.js";

const valid = { email: "sam@example.com", name: "Sam", password: TEST_PASSWORD };

describe("POST /auth/register", () => {
  it("creates an account and returns only public fields", async () => {
    const res = await api()
      .post("/auth/register")
      .send({ ...valid, email: "  Sam@Example.COM ", name: "  Sam " });

    expect(res.status).toBe(201);
    expect(res.body.data).toEqual({
      id: expect.any(Number),
      email: "sam@example.com", // trimmed and lowercased
      name: "Sam",              // trimmed
      createdAt: expect.any(String),
    });
    expect(new Date(res.body.data.createdAt).toISOString()).toBe(res.body.data.createdAt);
    expect(JSON.stringify(res.body).toLowerCase()).not.toContain("password");
  });

  it("stores an Argon2id hash and never the password", async () => {
    await api().post("/auth/register").send(valid);

    const row = await prisma.user.findUniqueOrThrow({ where: { email: valid.email } });
    expect(row.passwordHash).toMatch(/^\$argon2id\$/);
    expect(row.passwordHash).not.toContain(TEST_PASSWORD);
  });

  it("sends security-relevant headers", async () => {
    const res = await api().post("/auth/register").send(valid);

    expect(res.headers["cache-control"]).toContain("no-store");
    expect(res.headers["x-request-id"]).toBeTruthy();
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  it("answers 409 for a duplicate email, whatever its letter case, and stores one row", async () => {
    expect((await api().post("/auth/register").send(valid)).status).toBe(201);

    const res = await api().post("/auth/register").send({ ...valid, email: "SAM@EXAMPLE.COM" });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: { message: expect.any(String) } });
    expect(await prisma.user.count()).toBe(1);
  });

  it.each([
    ["a short password", { ...valid, password: "short" }],
    ["an invalid email", { ...valid, email: "nope" }],
    ["an unknown field (mass assignment)", { ...valid, role: "admin" }],
    ["a NUL character in the name", { ...valid, name: "a\u0000b" }],
    ["an empty object", {}],
  ])("rejects %s with 400, field details, and stores nothing", async (_name, body) => {
    const res = await api().post("/auth/register").send(body);

    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe("Validation failed");
    expect(Array.isArray(res.body.error.details)).toBe(true);
    expect(await prisma.user.count()).toBe(0);
  });

  it.each([
    ["malformed JSON", "application/json", "{bad json"],
    ["a JSON array", "application/json", "[]"],
    ["the JSON value null", "application/json", "null"],
    ["a text/plain body", "text/plain", "email=a&password=b"],
  ])("rejects %s with 400", async (_name, type, body) => {
    const res = await api().post("/auth/register").set("Content-Type", type).send(body);

    expect(res.status).toBe(400);
    expect(res.body.error.message).toEqual(expect.any(String));
    expect(await prisma.user.count()).toBe(0);
  });

  it("creates exactly one account when the same registration arrives eight times at once", async () => {
    const results = await Promise.all(
      Array.from({ length: 8 }, () => api().post("/auth/register").send(valid))
    );

    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(7);
    expect(await prisma.user.count()).toBe(1);
  });
});