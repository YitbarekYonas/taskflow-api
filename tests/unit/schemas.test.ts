import { describe, expect, it } from "vitest";
import { loginSchema, registerSchema } from "../../src/schemas/auth.schemas.js";
import { dbId, dbIdBody, noNul } from "../../src/schemas/common.schemas.js";
import {
  createTaskSchema,
  listTasksQuerySchema,
  updateTaskSchema,
} from "../../src/schemas/task.schemas.js";

const ok = (schema: { safeParse: (v: unknown) => { success: boolean } }, value: unknown) =>
  schema.safeParse(value).success;

describe("ids", () => {
  it.each(["1", "2147483647"])("accepts the id %j from a path or query", (value) => {
    expect(ok(dbId, value)).toBe(true);
  });

  it.each(["0", "-1", "1.5", "abc", "", "2147483648", "99999999999999999999999"])(
    "rejects the id %j from a path or query",
    (value) => {
      expect(ok(dbId, value)).toBe(false);
    },
  );

  it.each([1, 2147483647])("accepts the body id %j", (value) => {
    expect(ok(dbIdBody, value)).toBe(true);
  });

  it.each([0, -1, 1.5, 2147483648, 1e22, "1", null])("rejects the body id %j", (value) => {
    expect(ok(dbIdBody, value)).toBe(false);
  });
});

describe("noNul", () => {
  it("rejects the character PostgreSQL text columns cannot store", () => {
    expect(noNul("plain text")).toBe(true);
    expect(noNul("a\u0000b")).toBe(false);
  });
});

describe("registerSchema", () => {
  const valid = { email: "sam@example.com", name: "Sam", password: "long-enough-password" };

  it("normalises the email and the name but never touches the password", () => {
    const result = registerSchema.parse({
      email: "  Sam@Example.COM ",
      name: "  Sam  ",
      password: "  spaced password  ",
    });
    expect(result).toEqual({
      email: "sam@example.com",
      name: "Sam",
      password: "  spaced password  ",
    });
  });

  it("enforces the password length bounds", () => {
    expect(ok(registerSchema, { ...valid, password: "a".repeat(9) })).toBe(false);
    expect(ok(registerSchema, { ...valid, password: "a".repeat(10) })).toBe(true);
    expect(ok(registerSchema, { ...valid, password: "a".repeat(128) })).toBe(true);
    expect(ok(registerSchema, { ...valid, password: "a".repeat(129) })).toBe(false);
  });

  it.each([
    ["an unknown field such as role", { ...valid, role: "admin" }],
    ["an invalid email", { ...valid, email: "nope" }],
    ["an empty name", { ...valid, name: "   " }],
    ["a NUL character in the name", { ...valid, name: "a\u0000b" }],
    ["a missing password", { email: valid.email, name: valid.name }],
    ["an empty object", {}],
  ])("rejects %s", (_name, body) => {
    expect(ok(registerSchema, body)).toBe(false);
  });
});

describe("loginSchema", () => {
  it("does not apply password strength rules (they apply when a password is chosen)", () => {
    expect(ok(loginSchema, { email: "sam@example.com", password: "x" })).toBe(true);
  });

  it("rejects extra fields", () => {
    expect(ok(loginSchema, { email: "sam@example.com", password: "x", admin: true })).toBe(false);
  });
});

describe("createTaskSchema", () => {
  it("trims the title", () => {
    expect(createTaskSchema.parse({ title: "  Write tests  " }).title).toBe("Write tests");
  });

  it.each([
    ["an empty title", { title: "   " }],
    ["a title longer than 200 characters", { title: "x".repeat(201) }],
    ["a NUL character in the title", { title: "a\u0000b" }],
    ["a client-chosen id", { title: "x", id: 1 }],
    ["a client-chosen creator", { title: "x", createdById: 1 }],
    ["an unknown priority", { title: "x", priority: "urgent" }],
    ["an impossible date", { title: "x", dueDate: "2026-13-45" }],
    ["a date in the wrong format", { title: "x", dueDate: "01/02/2026" }],
    ["a project id beyond INTEGER", { title: "x", projectId: 99999999999 }],
  ])("rejects %s", (_name, body) => {
    expect(ok(createTaskSchema, body)).toBe(false);
  });

  it("accepts a complete valid task", () => {
    expect(
      ok(createTaskSchema, { title: "x", priority: "high", dueDate: "2026-12-01", projectId: 5 }),
    ).toBe(true);
  });
});

describe("updateTaskSchema", () => {
  it("requires at least one field", () => {
    expect(ok(updateTaskSchema, {})).toBe(false);
  });

  it("lets null clear the due date and the project", () => {
    expect(ok(updateTaskSchema, { dueDate: null })).toBe(true);
    expect(ok(updateTaskSchema, { projectId: null })).toBe(true);
  });

  it("rejects unknown fields", () => {
    expect(ok(updateTaskSchema, { title: "x", createdById: 1 })).toBe(false);
  });
});

describe("listTasksQuerySchema", () => {
  it("fills in the defaults", () => {
    expect(listTasksQuerySchema.parse({})).toMatchObject({
      page: 1,
      limit: 10,
      sort: "createdAt",
      order: "asc",
    });
  });

  it("converts numbers that arrive as strings", () => {
    expect(listTasksQuerySchema.parse({ page: "2", limit: "50" })).toMatchObject({
      page: 2,
      limit: 50,
    });
  });

  it.each([
    ["page 0", { page: "0" }],
    ["a non-numeric page", { page: "abc" }],
    ["limit 0", { limit: "0" }],
    ["limit above the cap", { limit: "101" }],
    ["an unknown sort field", { sort: "banana" }],
    ["a sort field with SQL in it", { sort: "title; DROP TABLE tasks" }],
    ["a repeated status (an array)", { status: ["todo", "done"] }],
    ["a NUL character in the search", { search: "a\u0000b" }],
    ["a project id beyond INTEGER", { projectId: "99999999999" }],
  ])("rejects %s", (_name, query) => {
    expect(ok(listTasksQuerySchema, query)).toBe(false);
  });

  it("trims the search text", () => {
    expect(listTasksQuerySchema.parse({ search: "  report " }).search).toBe("report");
  });
});
