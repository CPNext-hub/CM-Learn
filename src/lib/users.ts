import { and, count, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { sheetReactions, sheets, user } from "@/db/schema";
import { ApiError } from "@/lib/api";

// ---------------------------------------------------------------------------
// Avatars
// An uploaded avatar is stored at  avatars/<userId>/<uuid>.<ext>  and user.image holds its PUBLIC URL:
//   /api/v1/users/<userId>/avatar?v=<uuid>.<ext>
// The ?v= part changes on every upload, so browsers can cache the image yet still see a new one at once.
// user.image may also be an external URL (e.g. a Google profile picture) — then it is not our file.
// ---------------------------------------------------------------------------

const AVATAR_FILE_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp)$/;
const USER_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export const isValidUserId = (id: string) => USER_ID_RE.test(id);

const avatarPrefix = (userId: string) => `/api/v1/users/${userId}/avatar?v=`;

/** Public URL for a stored avatar key. */
export const avatarUrl = (userId: string, storageKey: string) =>
  avatarPrefix(userId) + storageKey.slice(storageKey.lastIndexOf("/") + 1);

/** Storage key of the user's uploaded avatar, or null if user.image is empty or an external URL. */
export function avatarKeyFromImage(userId: string, image: string | null | undefined): string | null {
  if (!image?.startsWith(avatarPrefix(userId))) return null;
  const fileName = image.slice(avatarPrefix(userId).length);
  return AVATAR_FILE_RE.test(fileName) ? `avatars/${userId}/${fileName}` : null;
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

/** The logged-in user's own profile (includes email and stats). */
export async function getOwnProfile(userId: string) {
  const db = getDb();
  const [row] = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
      bio: user.bio,
      role: user.role,
      createdAt: user.createdAt,
    })
    .from(user)
    .where(and(eq(user.id, userId), isNull(user.deletedAt)));
  if (!row) throw new ApiError("NOT_FOUND", "ไม่พบผู้ใช้");

  // Stats count only sheets that are not deleted (drafts and hidden ones are still "my sheets").
  const mine = and(eq(sheets.ownerId, userId), isNull(sheets.deletedAt));
  const [[sheetStats], [likeStats]] = await Promise.all([
    db
      .select({
        sheetCount: count(),
        publishedCount: sql<number>`count(*) filter (where ${sheets.status} = 'published')`.mapWith(Number),
        totalViews: sql<number>`coalesce(sum(${sheets.viewCount}), 0)`.mapWith(Number),
      })
      .from(sheets)
      .where(mine),
    db
      .select({ likeCount: count() })
      .from(sheetReactions)
      .innerJoin(sheets, eq(sheets.id, sheetReactions.sheetId))
      .where(and(mine, eq(sheetReactions.reaction, "like"))),
  ]);

  return { ...row, stats: { ...sheetStats, likeCount: likeStats.likeCount } };
}

export const NAME_MAX = 100;
export const BIO_MAX = 500;
const EDITABLE = new Set(["name", "bio", "image"]);

export type ProfileInput = { name?: string; bio?: string | null; image?: null };

/**
 * Validates a PATCH body. Only name, bio and image (= null to remove) may be changed.
 * Anything else — email, role, id… — is rejected so nobody can e.g. make themselves admin.
 */
export function parseProfileInput(raw: Record<string, unknown>): ProfileInput {
  const details: Record<string, string> = {};
  const input: ProfileInput = {};

  for (const key of Object.keys(raw)) {
    if (!EDITABLE.has(key)) details[key] = "แก้ไขช่องนี้ไม่ได้";
  }

  if ("name" in raw) {
    const name = typeof raw.name === "string" ? raw.name.trim() : "";
    if (!name) details.name = "กรุณากรอกชื่อที่แสดง";
    else if (name.length > NAME_MAX) details.name = `ชื่อต้องไม่เกิน ${NAME_MAX} ตัวอักษร`;
    else input.name = name;
  }

  if ("bio" in raw) {
    if (raw.bio === null) input.bio = null;
    else if (typeof raw.bio !== "string") details.bio = "ต้องเป็นข้อความ";
    else if (raw.bio.trim().length > BIO_MAX) details.bio = `ข้อความแนะนำตัวต้องไม่เกิน ${BIO_MAX} ตัวอักษร`;
    else input.bio = raw.bio.trim() || null;
  }

  if ("image" in raw) {
    if (raw.image === null || raw.image === "") input.image = null;
    else details.image = "ส่ง null เพื่อลบรูป · ตั้งรูปใหม่ผ่าน POST /api/v1/users/me/avatar";
  }

  if (Object.keys(details).length > 0) throw new ApiError("VALIDATION_ERROR", "ข้อมูลไม่ถูกต้อง", details);
  if (Object.keys(input).length === 0) throw new ApiError("VALIDATION_ERROR", "ไม่มีข้อมูลที่จะแก้ไข");
  return input;
}
