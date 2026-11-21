import { asc } from "drizzle-orm";
import { getDb } from "@/db/client";
import { subjects } from "@/db/schema";
import { ok, withErrors } from "@/lib/api";

export const dynamic = "force-dynamic"; // always read the database, never cache at build time

/** GET /api/v1/subjects — list of subjects for the Upload form and the Filter dropdown. */
export const GET = withErrors(async () => {
  const rows = await getDb().select({ id: subjects.id, name: subjects.name }).from(subjects).orderBy(asc(subjects.name));
  return ok(rows);
});
