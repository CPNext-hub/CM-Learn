// Database helpers for tests. The test database is cmlearn_test (see tests/setup/test-env.ts).
import { rm } from "node:fs/promises";
import { asc, sql } from "drizzle-orm";
import { beforeAll } from "vitest";
import { getDb, type Database } from "@/db/client";
import { categories, subjects } from "@/db/schema";

// Every table that tests write to. subjects/categories are NOT here: they are seed data from migration 0002.
const DATA_TABLES = [
  "reports",
  "collection_items",
  "collections",
  "favorites",
  "sheet_reactions",
  "comments",
  "sheet_files",
  "sheets",
  "verification",
  "account",
  "session",
  "user",
];

/** The same Drizzle client the app uses (DATABASE_URL already points at the test DB). */
export const testDb = (): Database => getDb();

/** Empties every data table and the upload folder. */
export async function resetDb() {
  const list = DATA_TABLES.map((t) => `"${t}"`).join(", ");
  await testDb().execute(sql.raw(`truncate table ${list} restart identity cascade`));
  if (process.env.UPLOAD_DIR) await rm(process.env.UPLOAD_DIR, { recursive: true, force: true });
}

/**
 * Call once at the top of a test file that uses the database:
 *   cleanDbBeforeAll();
 * The file then starts with empty tables (seeded subjects/categories are kept).
 */
export function cleanDbBeforeAll() {
  beforeAll(resetDb);
}

/** Seeded subjects and categories (from migration 0002), sorted by name. */
export async function lookups() {
  const db = testDb();
  const [subjectRows, categoryRows] = await Promise.all([
    db.select().from(subjects).orderBy(asc(subjects.name)),
    db.select().from(categories).orderBy(asc(categories.name)),
  ]);
  return { subjects: subjectRows, categories: categoryRows };
}

/** Closes the pools cached by src/db/client.ts (called automatically after every test file). */
export async function closeDbConnections() {
  // drizzle() attaches the postgres-js client as $client; the exported Database type does not declare it.
  type WithClient = Database & { $client: { end(options?: { timeout?: number }): Promise<void> } };
  const cache = (globalThis as unknown as { __cmLearnDb?: Map<string, WithClient> }).__cmLearnDb;
  if (!cache) return;
  await Promise.all([...cache.values()].map((db) => db.$client.end({ timeout: 5 })));
  cache.clear();
}
