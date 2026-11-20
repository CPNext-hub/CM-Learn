import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { getDb, type Database } from "@/db/client";
import * as schema from "@/db/schema";

// One Better Auth instance per database client. Locally getDb() returns the same cached client,
// so the auth instance is built once and reused; on Cloudflare each request gets its own.
const authByDb = new WeakMap<Database, ReturnType<typeof createAuth>>();

export async function getAuth() {
  const db = getDb();
  let auth = authByDb.get(db);
  if (!auth) {
    auth = createAuth(db);
    authByDb.set(db, auth);
  }
  return auth;
}

function createAuth(db: Database) {
  return betterAuth({
    database: drizzleAdapter(db, { provider: "pg", schema }),
    secret: process.env.BETTER_AUTH_SECRET,
    baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
    // Register/Login with email + password. Better Auth hashes the password (scrypt)
    // and stores only the hash in account.password.
    emailAndPassword: { enabled: true, minPasswordLength: 8, autoSignIn: true },
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
        // input: false = the client cannot set these during sign-up; our Profile API updates bio.
        bio: { type: "string", required: false, input: false },
        deletedAt: { type: "date", required: false, input: false },
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
