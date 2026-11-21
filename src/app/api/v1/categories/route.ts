import { asc } from "drizzle-orm";
import { getDb } from "@/db/client";
import { categories } from "@/db/schema";
import { ok, withErrors } from "@/lib/api";

export const dynamic = "force-dynamic"; // always read the database, never cache at build time

/** GET /api/v1/categories — list of categories for the Upload form and the Filter dropdown. */
export const GET = withErrors(async () => {
  const rows = await getDb()
    .select({ id: categories.id, name: categories.name })
    .from(categories)
    .orderBy(asc(categories.name));
  return ok(rows);
});
