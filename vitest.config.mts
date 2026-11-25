import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Unit tests for the logic layer (src/lib, src/services, src/app/api, src/db).
// Guide for the team: tests/README.md (.mts = loaded as ES module by Vite)
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Creates + migrates the test database once, and prepares the temporary upload folder.
    globalSetup: ["tests/setup/global-setup.ts"],
    // Runs inside every test file before it is imported: points DATABASE_URL at the test DB.
    setupFiles: ["tests/setup/per-file.ts"],
    // All files share ONE test database: run files one at a time so they never wipe each other's data.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 60_000,
    coverage: {
      provider: "v8",
      // Scope agreed with the seniors: logic only.
      include: [
        "src/lib/**/*.ts",
        "src/services/**/*.ts",
        "src/app/api/**/*.ts",
        "src/db/client.ts",
        "src/db/schema.ts",
      ],
      reporter: ["text", "html", "json-summary"],
      reportsDirectory: "coverage",
      thresholds: { lines: 95 },
    },
  },
});
