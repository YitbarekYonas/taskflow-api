import { defineConfig } from "vitest/config";
import { TEST_ENV } from "./tests/support/env.js";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    globalSetup: ["tests/support/globalSetup.ts"], // once per run: create and migrate the database
    setupFiles: ["tests/support/setup.ts"],        // before every test file: wipe, disconnect
    env: TEST_ENV,
    fileParallelism: false, // all files share one database, so they must run one after another
    testTimeout: 20_000,    // Argon2 is slow on purpose
    hookTimeout: 60_000,
    restoreMocks: true,
    unstubEnvs: true,
  },
});