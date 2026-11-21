import { getCloudflareContext } from "@opennextjs/cloudflare";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";

export type Database = PostgresJsDatabase<typeof schema>;

type HyperdriveEnv = { HYPERDRIVE?: { connectionString: string } };

// One cached client per connection URL for the Node runtime (next dev / Docker).
// Stored on globalThis so Next.js dev hot-reload does not open a new pool on every file save.
const globalForDb = globalThis as unknown as { __cmLearnDb?: Map<string, Database> };
const cache = (globalForDb.__cmLearnDb ??= new Map());

function getHyperdriveUrl(): string | undefined {
  try {
    const { env } = getCloudflareContext();
    return (env as CloudflareEnv & HyperdriveEnv).HYPERDRIVE?.connectionString;
  } catch {
    return undefined; // not running on Cloudflare
  }
}

function createDb(url: string, maxConnections: number): Database {
  return drizzle(postgres(url, { max: maxConnections }), { schema });
}

/**
 * Returns the Drizzle database for the current runtime.
 * - Node (local): reuse ONE pooled client for the whole process, so requests do not leak connections.
 * - Cloudflare Workers: I/O objects cannot be shared between requests, so create a small client per
 *   request; Hyperdrive keeps the real connection pool on Cloudflare's side.
 */
export function getDb(): Database {
  const hyperdriveUrl = getHyperdriveUrl();
  if (hyperdriveUrl) return createDb(hyperdriveUrl, 1);

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Set DATABASE_URL locally or configure the HYPERDRIVE binding on Cloudflare.");

  let db = cache.get(url);
  if (!db) {
    db = createDb(url, 10);
    cache.set(url, db);
  }
  return db;
}
