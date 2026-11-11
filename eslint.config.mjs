import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import prettier from "eslint-config-prettier";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig(
  {
    ignores: ["dist/**", "coverage/**", "src/generated/**", "node_modules/**", "prisma/migrations/**"],
  },
  // A stale "eslint-disable" comment is itself a mistake
  { linterOptions: { reportUnusedDisableDirectives: "error" } },

  js.configs.recommended,

  {
    files: ["**/*.ts"],
    extends: [tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        // one tsconfig that covers src, tests, scripts and the config files
        project: ["./tsconfig.scripts.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "separate-type-imports" },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // Deliberately off: an async function that returns a promise (without awaiting it) is fine,
      // and thrown errors still become rejections. The rule fires on correct code.
      "@typescript-eslint/require-await": "off",
      "no-console": ["error", { allow: ["error"] }], // use the logger in application code
      eqeqeq: ["error", "always"],
    },
  },

  // Layering: HTTP code, business logic and helpers never touch the database or Prisma directly.
  // Only repositories, the composition root, the server and the CLI may.
  {
    files: [
      "src/controllers/**/*.ts",
      "src/routes/**/*.ts",
      "src/services/**/*.ts",
      "src/auth/**/*.ts",
      "src/middleware/**/*.ts",
      "src/schemas/**/*.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/db.js", "**/generated/**", "**/repositories/prisma/**"],
              message:
                "This layer must not use Prisma or the database directly. Go through a repository interface (see src/container.ts).",
            },
          ],
        },
      ],
    },
  },

  // Scripts, seed and the CLI print on purpose
  {
    files: ["src/cli.ts", "scripts/**/*.ts", "prisma/seed.ts", "tests/**/*.ts"],
    rules: { "no-console": "off" },
  },

  // Tests and scripts read untyped HTTP bodies (res.body is `any` by design)
  {
    files: ["tests/**/*.ts", "scripts/**/*.ts", "prisma/seed.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-return": "off",
    },
  },

  // This config file is plain JavaScript: no type information for it
  {
    files: ["**/*.mjs"],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node },
  },

  prettier, // always last: switches off every rule that would fight the formatter
);