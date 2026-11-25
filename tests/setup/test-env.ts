// Shared by global-setup.ts (once) and per-file.ts (every test file).
// Turns the developer's .env into a SAFE test environment:
//   - DATABASE_URL points at a separate database ending in "_test" (never the dev database)
//   - uploads go to a temporary folder
//   - auth settings are fixed so tests behave the same on every machine
import os from "node:os";
import path from "node:path";
import { config } from "dotenv";

export const TEST_UPLOAD_DIR = path.join(os.tmpdir(), "cmlearn-test-uploads");
export const TEST_ORIGIN = "http://localhost:3000";
export const TEST_ADMIN_EMAIL = "admin@cmlearn.test";

export type TestEnv = { url: string; databaseName: string; adminUrl: string };

let loaded: TestEnv | undefined;

export function loadTestEnv(): TestEnv {
  if (loaded) return loaded;
  config({ path: ".env" }); // never overrides variables that are already set

  // TEST_DATABASE_URL wins; otherwise reuse the .env connection with the database renamed to cmlearn_test.
  const source = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!source) throw new Error("Tests need DATABASE_URL (in .env) or TEST_DATABASE_URL.");
  const url = new URL(source);
  if (!process.env.TEST_DATABASE_URL) url.pathname = "/cmlearn_test";

  const databaseName = decodeURIComponent(url.pathname.slice(1));
  // Safety net: tests TRUNCATE tables, so refuse anything that is not clearly a test database.
  if (!/^[a-z0-9_]+_test$/.test(databaseName)) {
    throw new Error(`Refusing to run tests against "${databaseName}": the test database name must end with "_test".`);
  }

  const adminUrl = new URL(url);
  adminUrl.pathname = "/postgres";

  process.env.DATABASE_URL = url.toString();
  process.env.UPLOAD_DIR = TEST_UPLOAD_DIR;
  process.env.BETTER_AUTH_URL = TEST_ORIGIN;
  process.env.BETTER_AUTH_SECRET ??= "test-secret-for-unit-tests-only-0123456789";
  process.env.ADMIN_EMAILS = TEST_ADMIN_EMAIL;

  loaded = { url: url.toString(), databaseName, adminUrl: adminUrl.toString() };
  return loaded;
}
