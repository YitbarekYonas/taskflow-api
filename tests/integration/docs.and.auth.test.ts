import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { openApiSpec } from "../../src/docs/openapi.js";
import { api } from "../support/app.js";

// Operations that must work without credentials. Anything else documented must answer 401.
const PUBLIC = new Set([
  "GET /health",
  "GET /ready",
  "POST /auth/register",
  "POST /auth/login",
  "POST /auth/refresh",
  "POST /auth/logout",
]);
const METHODS = ["get", "post", "put", "patch", "delete"] as const;

const operations = Object.entries(openApiSpec.paths).flatMap(([path, item]) =>
  METHODS.filter((m) => m in (item as object)).map((method) => ({
    method,
    path,
    key: `${method.toUpperCase()} ${path}`,
  })),
);

describe("every documented operation", () => {
  it("is found in the specification", () => {
    expect(operations.length).toBeGreaterThan(20);
    for (const key of PUBLIC) expect(operations.map((o) => o.key)).toContain(key);
  });

  it.each(operations)(
    "$key answers correctly without credentials",
    async ({ method, path, key }) => {
      const url = path.replace(/\{[^}]+\}/g, "1");
      const request = api()[method](url);
      const res = ["post", "patch", "put"].includes(method)
        ? await request.send({})
        : await request;

      if (PUBLIC.has(key)) expect(res.status).not.toBe(401);
      else expect(res.status).toBe(401);
    },
  );

  it.each(operations.filter((o) => !PUBLIC.has(o.key)))(
    "$key documents a 401 response",
    ({ method, path }) => {
      const operation = (openApiSpec.paths as any)[path][method];
      expect(Object.keys(operation.responses)).toContain("401");
    },
  );
});

describe("documentation endpoints", () => {
  it("serves the specification, its version matching package.json", async () => {
    const res = await api().get("/openapi.json");

    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe("3.1.0");
    expect(res.body.info.version).toBe(JSON.parse(readFileSync("package.json", "utf-8")).version);
  });

  it("serves the interactive docs page", async () => {
    expect((await api().get("/docs/")).status).toBe(200);
  });

  it("declares the bearer security scheme", () => {
    expect((openApiSpec.components.securitySchemes as any).bearerAuth).toMatchObject({
      type: "http",
      scheme: "bearer",
    });
  });
});

describe("operation ids", () => {
  const ids = operations.map(
    ({ method, path }) => (openApiSpec.paths as any)[path][method].operationId as string,
  );

  it("exist on every operation", () => {
    expect(ids.every((id) => typeof id === "string" && id.length > 0)).toBe(true);
  });

  it("are unique", () => {
    expect(new Set(ids).size).toBe(ids.length);
  });
});
