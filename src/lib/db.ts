import { getCloudflareContext } from "@opennextjs/cloudflare";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";

let sqlClient: ReturnType<typeof postgres> | undefined;
let sqlUrl: string | undefined;

async function getDatabaseUrl() {
  try {
    const { env } = getCloudflareContext();
    const hyperdrive = (env as CloudflareEnv & { HYPERDRIVE?: { connectionString: string } }).HYPERDRIVE;
    if (hyperdrive?.connectionString) return hyperdrive.connectionString;
  } catch {
    // Local Next.js development uses DATABASE_URL.
  }
  return process.env.DATABASE_URL;
}

export async function getDb() {
  const databaseUrl = await getDatabaseUrl();
  if (!databaseUrl) throw new Error("Database is not configured. Set DATABASE_URL or configure HYPERDRIVE.");
  if (!sqlClient || sqlUrl !== databaseUrl) {
    sqlClient = postgres(databaseUrl, { max: 1 });
    sqlUrl = databaseUrl;
  }
  return drizzle(sqlClient, { schema });
}
