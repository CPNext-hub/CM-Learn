import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { user } from "@/db/schema";
import { ok, readJsonObject, requireSessionUser, withErrors } from "@/lib/api";
import { deleteFile } from "@/lib/storage";
import { avatarKeyFromImage, getOwnProfile, parseProfileInput } from "@/lib/users";

/**
 * GET /api/v1/users/me — the logged-in user's profile:
 * { id, name, email, image, bio, role, createdAt, stats: { sheetCount, publishedCount, totalViews, likeCount } }
 */
export const GET = withErrors(async (request: Request) => {
  const me = await requireSessionUser(request);
  return ok(await getOwnProfile(me.id));
});

/**
 * PATCH /api/v1/users/me — edit own profile. JSON body, send only the fields to change:
 *   { name?: string, bio?: string | null, image?: null }
 * image can only be removed here (null); upload a new picture with POST /api/v1/users/me/avatar.
 * email and role cannot be changed through this API.
 */
export const PATCH = withErrors(async (request: Request) => {
  const me = await requireSessionUser(request);
  const input = parseProfileInput(await readJsonObject(request));
  const db = getDb();

  // Remember the current avatar file so it can be removed after the picture is cleared.
  const [current] = await db.select({ image: user.image }).from(user).where(eq(user.id, me.id));
  await db.update(user).set(input).where(eq(user.id, me.id)); // updatedAt is set by $onUpdate

  const oldKey = input.image === null ? avatarKeyFromImage(me.id, current?.image) : null;
  if (oldKey) await deleteFile(oldKey).catch(() => {}); // best-effort: the profile is already updated

  return ok(await getOwnProfile(me.id));
});
