import { headers } from "next/headers";
import { getAuth } from "@/lib/auth";

/** Current session for server-rendered pages, or null for guests. Soft-deleted accounts are guests (same rule as lib/api.ts). */
export async function getSession() {
  const auth = await getAuth();
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || session.user.deletedAt) return null;
  return session;
}

export async function requireUser() {
  const session = await getSession();
  if (!session) return null;
  return session;
}

export async function requireAdmin() {
  const session = await requireUser();
  return session?.user.role === "admin" ? session : null;
}
