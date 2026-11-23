import { getCloudflareContext } from "@opennextjs/cloudflare";
import postgres from "postgres";

const clients = new Map<string, ReturnType<typeof postgres>>();

async function databaseUrl() {
  try {
    const { env } = getCloudflareContext();
    const hyperdrive = (env as CloudflareEnv & { HYPERDRIVE?: { connectionString: string } }).HYPERDRIVE;
    if (hyperdrive?.connectionString) return hyperdrive.connectionString;
  } catch {
    // Local Next.js and Node runtimes use DATABASE_URL.
  }
  return process.env.DATABASE_URL;
}

export async function getInteractionSql() {
  const url = await databaseUrl();
  if (!url) throw new Error("Set DATABASE_URL or configure the HYPERDRIVE binding.");
  let client = clients.get(url);
  if (!client) {
    client = postgres(url, { max: 1 });
    clients.set(url, client);
  }
  return client;
}
