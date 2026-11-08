import { TEST_ENV } from "./tests/support/env.js";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
    // Every variable src/config.ts reads is set here, so no test can depend on your local .env
    env:TEST_ENV,
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