import { defineConfig } from "vitest/config";
import { TEST_ENV } from "./tests/support/env.js";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/support/globalSetup.ts"],
    setupFiles: ["tests/support/setup.ts"],
    env: TEST_ENV,
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 60_000,
    restoreMocks: true,
    unstubEnvs: true,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // Generated code and process entry points. Hard-to-test code is NOT a reason to exclude it.
      exclude: ["src/generated/**", "src/cli.ts", "src/server.ts", "src/utils.ts"],
      reporter: ["text", "html", "json-summary"],
      reportsDirectory: "coverage",
      thresholds: { statements: 90, branches: 78, functions: 96, lines: 92 },
    },
  },
});
