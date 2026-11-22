import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import * as schema from "@/db/schema";
import { getDb } from "@/lib/db";

export async function getAuth() {
  const db = await getDb();

  return betterAuth({
    database: drizzleAdapter(db, { provider: "pg", schema }),
    secret: process.env.BETTER_AUTH_SECRET,
    baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
    emailAndPassword: { enabled: true },
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
