// A separate database, in the same PostgreSQL container as development.
// Override it in CI with TEST_DATABASE_URL.
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/taskflow_test";

// Every variable src/config.ts reads, so no test depends on your local .env.
export const TEST_ENV: Record<string, string> = {
  NODE_ENV: "test",
  PORT: "3000",
  LOG_LEVEL: "error",
  CORS_ORIGIN: "http://localhost:5173",
  DATABASE_URL: TEST_DATABASE_URL,
  JWT_SECRET: "unit-test-secret-that-is-at-least-32-characters-long",
  ACCESS_TOKEN_TTL_SECONDS: "900",
  REFRESH_TOKEN_TTL_DAYS: "30",
  RATE_LIMIT_ENABLED: "false",
  TRUST_PROXY_HOPS: "0",
  DOCS_ENABLED: "true",
  DOTENV_CONFIG_QUIET: "true",
};
