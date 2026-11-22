import path from "node:path";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db/client";
import { user } from "@/db/schema";
import { ApiError, withErrors } from "@/lib/api";
import { kindForExt, openFile } from "@/lib/storage";
import { avatarKeyFromImage, isValidUserId } from "@/lib/users";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/v1/users/:id/avatar — a user's uploaded profile picture (public, like a profile photo on any site).
 * The URL is whatever `image` holds, e.g. /api/v1/users/<id>/avatar?v=<file>, so use `image` directly in <img>.
 */
export const GET = withErrors(async (_request: Request, { params }: Ctx) => {
  const { id } = await params;
  if (!isValidUserId(id)) throw new ApiError("NOT_FOUND", "ไม่พบรูปโปรไฟล์");

  // The storage key comes from the database, never from the request, so a URL cannot point at other files.
  const [row] = await getDb()
    .select({ image: user.image })
    .from(user)
    .where(and(eq(user.id, id), isNull(user.deletedAt)));
  const key = avatarKeyFromImage(id, row?.image);
  const opened = key ? await openFile(key) : null;
  if (!key || !opened) throw new ApiError("NOT_FOUND", "ไม่พบรูปโปรไฟล์");

  return new Response(opened.stream, {
    headers: {
      "Content-Type": kindForExt(path.extname(key))?.mime ?? "application/octet-stream",
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
      // The URL changes (?v=) whenever the picture changes, so caching for a day is safe.
      "Cache-Control": "public, max-age=86400",
    },
  });
});
