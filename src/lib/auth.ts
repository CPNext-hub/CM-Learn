import { getCloudflareContext } from "@opennextjs/cloudflare";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";

async function getDatabaseUrl() {
  try {
    const { env } = getCloudflareContext();
    const hyperdrive = (env as CloudflareEnv & { HYPERDRIVE?: { connectionString: string } }).HYPERDRIVE;
    if (hyperdrive?.connectionString) return hyperdrive.connectionString;
  } catch {
    // next dev and the Node Docker runtime use DATABASE_URL instead.
  }
  return process.env.DATABASE_URL;
}

export async function getAuth() {
  const databaseUrl = await getDatabaseUrl();
  if (!databaseUrl) throw new Error("Set DATABASE_URL locally or configure the HYPERDRIVE binding on Cloudflare.");
  const client = postgres(databaseUrl, { max: 1 });
  const db = drizzle(client, { schema });

  return betterAuth({
    database: drizzleAdapter(db, { provider: "pg", schema }),
    secret: process.env.BETTER_AUTH_SECRET,
    baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
    emailAndPassword: { enabled: false },
    socialProviders: {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID ?? "",
        clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      },
      facebook: {
        clientId: process.env.FACEBOOK_CLIENT_ID ?? "",
        clientSecret: process.env.FACEBOOK_CLIENT_SECRET ?? "",
      },
    },
    user: {
      additionalFields: {
        role: { type: "string", required: false, defaultValue: "user", input: false },
      },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (newUser) => {
            const adminEmails = (process.env.ADMIN_EMAILS ?? "")
              .split(",")
              .map((email) => email.trim().toLowerCase())
              .filter(Boolean);
            return adminEmails.includes(newUser.email.toLowerCase())
              ? { data: { ...newUser, role: "admin" } }
              : { data: newUser };
          },
        },
      },
    },
  });
}
