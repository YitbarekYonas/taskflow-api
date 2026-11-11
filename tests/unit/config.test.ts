import { describe, expect, it, vi } from "vitest";

const BASELINE: Record<string, string> = {
  NODE_ENV: "test",
  PORT: "3000",
  LOG_LEVEL: "error",
  CORS_ORIGIN: "http://localhost:5173",
  DATABASE_URL: "postgresql://u:p@localhost:5432/db",
  JWT_SECRET: "x".repeat(40),
  ACCESS_TOKEN_TTL_SECONDS: "900",
  REFRESH_TOKEN_TTL_DAYS: "30",
  RATE_LIMIT_ENABLED: "true",
  TRUST_PROXY_HOPS: "0",
  DOCS_ENABLED: "true",
};

// Loads a fresh copy of the config module under a complete, controlled environment
async function loadConfig(overrides: Record<string, string> = {}) {
  vi.resetModules();
  for (const [name, value] of Object.entries({ ...BASELINE, ...overrides }))
    vi.stubEnv(name, value);
  return (await import("../../src/config.js")).config;
}

// process.exit would end the test run, so turn it into an exception we can assert on
function trapExit() {
  const errors = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
    throw new Error(`exit ${code}`);
  }) as never);
  return errors;
}

describe("config", () => {
  it("parses and converts valid values", async () => {
    const config = await loadConfig({
      PORT: "8080",
      CORS_ORIGIN: "http://a.example, http://b.example",
    });
    expect(config.port).toBe(8080);
    expect(config.corsOrigins).toEqual(["http://a.example", "http://b.example"]);
    expect(config.accessTokenTtl).toBe(900);
    expect(config.refreshTokenTtlDays).toBe(30);
  });

  it("reads the string 'false' as false (z.coerce.boolean would say true)", async () => {
    const config = await loadConfig({ RATE_LIMIT_ENABLED: "false", DOCS_ENABLED: "false" });
    expect(config.rateLimitEnabled).toBe(false);
    expect(config.docsEnabled).toBe(false);
  });

  it.each([
    ["a non-numeric PORT", { PORT: "abc" }, "PORT"],
    ["a PORT out of range", { PORT: "70000" }, "PORT"],
    ["a JWT_SECRET shorter than 32 characters", { JWT_SECRET: "short" }, "JWT_SECRET"],
    ["a boolean spelled yes", { RATE_LIMIT_ENABLED: "yes" }, "RATE_LIMIT_ENABLED"],
    ["a non-postgres DATABASE_URL", { DATABASE_URL: "mysql://u:p@h/db" }, "DATABASE_URL"],
    ["an unknown LOG_LEVEL", { LOG_LEVEL: "banana" }, "LOG_LEVEL"],
  ])("refuses to start with %s and names the variable", async (_name, overrides, variable) => {
    const errors = trapExit();
    await expect(loadConfig(overrides)).rejects.toThrow("exit 1");
    expect(errors.mock.calls.flat().join("\n")).toContain(variable);
  });

  describe("production guards", () => {
    it("refuses the public placeholder secret", async () => {
      trapExit();
      await expect(
        loadConfig({
          NODE_ENV: "production",
          JWT_SECRET: "replace-me-with-a-long-random-string-at-least-32-chars",
        }),
      ).rejects.toThrow("exit 1");
    });

    it("refuses to run without rate limiting", async () => {
      trapExit();
      await expect(
        loadConfig({ NODE_ENV: "production", RATE_LIMIT_ENABLED: "false" }),
      ).rejects.toThrow("exit 1");
    });

    it("accepts a properly configured production environment", async () => {
      const config = await loadConfig({ NODE_ENV: "production" });
      expect(config.rateLimitEnabled).toBe(true);
    });
  });
});
