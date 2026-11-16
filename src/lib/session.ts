import { headers } from "next/headers";
import { getAuth } from "@/lib/auth";

export async function getSession() {
  const auth = await getAuth();
  return auth.api.getSession({ headers: await headers() });
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
