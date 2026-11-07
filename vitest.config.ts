import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
    // Every variable src/config.ts reads is set here, so no test can depend on your local .env
    env: {
      NODE_ENV: "test",
      PORT: "3000",
      LOG_LEVEL: "error",
      CORS_ORIGIN: "http://localhost:5173",
      DATABASE_URL: "postgresql://test:test@localhost:5432/unused",
      JWT_SECRET: "unit-test-secret-that-is-at-least-32-characters-long",
      ACCESS_TOKEN_TTL_SECONDS: "900",
      REFRESH_TOKEN_TTL_DAYS: "30",
      RATE_LIMIT_ENABLED: "true",
      TRUST_PROXY_HOPS: "0",
      DOCS_ENABLED: "true",
      DOTENV_CONFIG_QUIET: "true",
    },
    restoreMocks: true, // spies are restored before every test
    unstubEnvs: true,   // vi.stubEnv changes are undone after every test
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/generated/**", "src/cli.ts", "src/server.ts"],
      reporter: ["text-summary", "html"],
    },
  },
});