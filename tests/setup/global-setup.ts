// Runs ONCE before all test files: create the test database if needed, apply every migration,
// and start with an empty upload folder. The returned function runs once after all files.
import { rm } from "node:fs/promises";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { loadTestEnv, TEST_UPLOAD_DIR } from "./test-env";

export default async function setup() {
  const { url, databaseName, adminUrl } = loadTestEnv();

  const admin = postgres(adminUrl, { max: 1, onnotice: () => {} });
  try {
    const exists = await admin`select 1 from pg_database where datname = ${databaseName}`;
    if (exists.length === 0) await admin.unsafe(`create database "${databaseName}"`);
  } finally {
    await admin.end();
  }

  const client = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await migrate(drizzle(client), { migrationsFolder: "src/db/migrations" });
  } finally {
    await client.end();
  }

  await rm(TEST_UPLOAD_DIR, { recursive: true, force: true });

  return async () => {
    await rm(TEST_UPLOAD_DIR, { recursive: true, force: true });
  };
}
