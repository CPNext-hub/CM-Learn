import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { user } from "@/db/schema";
import { ApiError, ok, readMultipart, requireSessionUser, withErrors } from "@/lib/api";
import { AVATAR_MAX_BYTES, AVATAR_RULES, deleteFile, saveFile, validateUpload } from "@/lib/storage";
import { avatarKeyFromImage, avatarUrl, getOwnProfile } from "@/lib/users";

/**
 * POST /api/v1/users/me/avatar — upload a new profile picture.
 * multipart/form-data with field `file`: PNG, JPG or WEBP, at most 2 MB (checked by real content).
 * Returns the updated profile; `image` is the new public URL.
 */
export const POST = withErrors(async (request: Request) => {
  const me = await requireSessionUser(request);
  const { file } = await readMultipart(request, AVATAR_MAX_BYTES + 64 * 1024, "รูปโปรไฟล์ต้องมีขนาดไม่เกิน 2 MB");
  if (!file) throw new ApiError("VALIDATION_ERROR", "กรุณาเลือกรูป", { file: "กรุณาเลือกรูป" });
  const validated = await validateUpload(file, AVATAR_RULES);

  const db = getDb();
  const [current] = await db.select({ image: user.image }).from(user).where(eq(user.id, me.id));

  // Save first, then point the profile at it; if the DB update fails, remove the new file again.
  const key = await saveFile(`avatars/${me.id}`, validated);
  try {
    await db.update(user).set({ image: avatarUrl(me.id, key) }).where(eq(user.id, me.id));
  } catch (error) {
    await deleteFile(key).catch(() => {});
    throw error;
  }

  // The previous uploaded picture is no longer used.
  const oldKey = avatarKeyFromImage(me.id, current?.image);
  if (oldKey) await deleteFile(oldKey).catch(() => {});

  return ok(await getOwnProfile(me.id));
});
