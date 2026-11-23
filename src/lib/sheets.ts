import { and, asc, count, desc, eq, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { getDb } from "@/db/client";
import { categories, comments, sheetFiles, sheetReactions, sheets, subjects, user, SHEET_STATUSES } from "@/db/schema";
import { ApiError, isUuid, readJsonObject, readMultipart, type SessionUser } from "@/lib/api";
import { kindForMime, MAX_UPLOAD_BYTES } from "@/lib/storage";

// ---------------------------------------------------------------------------
// Reading sheets: one base query reused by list, detail and "my sheets".
// ---------------------------------------------------------------------------

const likeCount = sql<number>`(select count(*) from ${sheetReactions} where ${sheetReactions.sheetId} = ${sheets.id} and ${sheetReactions.reaction} = 'like')`.mapWith(Number);
const dislikeCount = sql<number>`(select count(*) from ${sheetReactions} where ${sheetReactions.sheetId} = ${sheets.id} and ${sheetReactions.reaction} = 'dislike')`.mapWith(Number);
const commentCount = sql<number>`(select count(*) from ${comments} where ${comments.sheetId} = ${sheets.id} and ${comments.deletedAt} is null)`.mapWith(Number);

function baseSelect() {
  return getDb()
    .select({
      sheet: sheets,
      owner: { id: user.id, name: user.name, image: user.image },
      subject: { id: subjects.id, name: subjects.name },
      category: { id: categories.id, name: categories.name },
      likeCount,
      dislikeCount,
      commentCount,
    })
    .from(sheets)
    .innerJoin(user, eq(user.id, sheets.ownerId))
    .leftJoin(subjects, eq(subjects.id, sheets.subjectId))
    .leftJoin(categories, eq(categories.id, sheets.categoryId));
}

type SheetRow = Awaited<ReturnType<typeof baseSelect>>[number];
type LatestFile = { id: string; versionNo: number; mimeType: string; sizeBytes: number; storageKey: string };

/** Latest "original" file of each sheet, keyed by sheet id. */
export async function latestFiles(sheetIds: string[]): Promise<Map<string, LatestFile>> {
  const map = new Map<string, LatestFile>();
  if (sheetIds.length === 0) return map;
  const rows = await getDb()
    .select({
      id: sheetFiles.id,
      sheetId: sheetFiles.sheetId,
      versionNo: sheetFiles.versionNo,
      mimeType: sheetFiles.mimeType,
      sizeBytes: sheetFiles.sizeBytes,
      storageKey: sheetFiles.storageKey,
    })
    .from(sheetFiles)
    .where(and(inArray(sheetFiles.sheetId, sheetIds), eq(sheetFiles.assetType, "original")))
    .orderBy(desc(sheetFiles.versionNo));
  for (const row of rows) if (!map.has(row.sheetId)) map.set(row.sheetId, row); // first = highest version
  return map;
}

/** Shape sent to the client. Note: storageKey is deliberately NOT included. */
export function toSheetDto(row: SheetRow, file: LatestFile | undefined) {
  const { sheet } = row;
  const kind = file ? kindForMime(file.mimeType) : undefined;
  return {
    id: sheet.id,
    title: sheet.title,
    description: sheet.description,
    status: sheet.status,
    viewCount: sheet.viewCount,
    likeCount: row.likeCount,
    dislikeCount: row.dislikeCount,
    commentCount: row.commentCount,
    owner: row.owner,
    subject: row.subject,
    category: row.category,
    file: file ? { mimeType: file.mimeType, sizeBytes: file.sizeBytes, versionNo: file.versionNo } : null,
    previewUrl: file && kind?.inlineSafe ? `/api/v1/sheets/${sheet.id}/download?inline=1` : null,
    downloadUrl: file ? `/api/v1/sheets/${sheet.id}/download` : null,
    createdAt: sheet.createdAt,
    updatedAt: sheet.updatedAt,
  };
}
export type SheetDto = ReturnType<typeof toSheetDto>;

export type ListOptions = {
  where: SQL | undefined;
  sort: "newest" | "popular";
  limit: number;
  offset: number;
};

/** Runs a paginated list query and returns DTOs plus the total row count. */
export async function listSheets({ where, sort, limit, offset }: ListOptions) {
  const orderBy =
    sort === "popular"
      ? [desc(sheets.viewCount), desc(sheets.createdAt), asc(sheets.id)]
      : [desc(sheets.createdAt), asc(sheets.id)];

  const [rows, [{ total }]] = await Promise.all([
    baseSelect().where(where).orderBy(...orderBy).limit(limit).offset(offset),
    getDb().select({ total: count() }).from(sheets).where(where),
  ]);
  const files = await latestFiles(rows.map((r) => r.sheet.id));
  return { items: rows.map((r) => toSheetDto(r, files.get(r.sheet.id))), total };
}

/**
 * Full sheet DTOs for a set of ids (no access check: the caller has already filtered the ids).
 * Used by other features that store sheet ids, e.g. BE02 favorites.
 */
export async function getSheetDtos(ids: string[]): Promise<Map<string, SheetDto>> {
  const map = new Map<string, SheetDto>();
  if (ids.length === 0) return map;
  const rows = await baseSelect().where(inArray(sheets.id, ids));
  const files = await latestFiles(rows.map((r) => r.sheet.id));
  for (const r of rows) map.set(r.sheet.id, toSheetDto(r, files.get(r.sheet.id)));
  return map;
}

/**
 * Search over title + description.
 * - Full-text search uses the SAME expression as the GIN index `sheets_search_idx`.
 * - ILIKE is a fallback for Thai: Postgres cannot split Thai words, so "สรุปเคมี" would not match "เคมี" via FTS.
 */
export function searchCondition(q: string): SQL {
  const tsv = sql`to_tsvector('simple', coalesce(${sheets.title}, '') || ' ' || coalesce(${sheets.description}, ''))`;
  const pattern = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`; // escape LIKE wildcards typed by the user
  return or(
    sql`${tsv} @@ plainto_tsquery('simple', ${q})`,
    ilike(sheets.title, pattern),
    ilike(sheets.description, pattern),
  )!;
}

export const notDeleted = isNull(sheets.deletedAt);

// ---------------------------------------------------------------------------
// Access rules
//   read:  published sheets for everyone; any status for the owner; deleted = gone for everyone
//   write: owner only
// ---------------------------------------------------------------------------

async function findRow(id: string) {
  const [row] = await baseSelect().where(and(eq(sheets.id, id), notDeleted)).limit(1);
  return row;
}

/** Sheet the viewer may see, or 404 (we also answer 404 for other people's drafts so we do not leak them). */
export async function getVisibleSheet(id: string, viewer: SessionUser | null) {
  const row = await findRow(id);
  const isOwner = !!row && row.sheet.ownerId === viewer?.id;
  if (!row || (row.sheet.status !== "published" && !isOwner)) {
    throw new ApiError("NOT_FOUND", "ไม่พบชีทนี้");
  }
  return { row, isOwner };
}

/** Sheet the user owns, or 404 / 403. Call before every edit or delete. */
export async function getOwnedSheet(id: string, viewer: SessionUser) {
  const row = await findRow(id);
  if (!row) throw new ApiError("NOT_FOUND", "ไม่พบชีทนี้");
  if (row.sheet.ownerId !== viewer.id) {
    // Someone else's draft/hidden sheet should look like it does not exist.
    if (row.sheet.status !== "published") throw new ApiError("NOT_FOUND", "ไม่พบชีทนี้");
    throw new ApiError("FORBIDDEN", "คุณไม่มีสิทธิ์แก้ไขชีทนี้");
  }
  return row;
}

// ---------------------------------------------------------------------------
// Validating create / update input (works for both JSON and multipart form fields)
// ---------------------------------------------------------------------------

export const TITLE_MAX = 200;
export const DESCRIPTION_MAX = 5000;
type SheetStatus = (typeof SHEET_STATUSES)[number];

export type SheetInput = {
  title?: string;
  description?: string | null;
  subjectId?: string | null;
  categoryId?: string | null;
  status?: SheetStatus;
};

/**
 * Validates raw fields. `undefined` = field not sent (keep current value), `null` = clear it.
 * For create, pass requireTitle = true.
 */
export async function parseSheetInput(
  raw: Record<string, unknown>,
  opts: { requireTitle: boolean; allowedStatuses: readonly SheetStatus[] },
): Promise<SheetInput> {
  const details: Record<string, string> = {};
  const input: SheetInput = {};

  const str = (name: string): string | null | undefined => {
    const value = raw[name];
    if (value === undefined) return undefined;
    if (value === null) return null;
    if (typeof value !== "string") {
      details[name] = "ต้องเป็นข้อความ";
      return undefined;
    }
    return value.trim();
  };

  const title = str("title");
  if (title === undefined || title === null || title === "") {
    if (opts.requireTitle || title !== undefined) details.title = "กรุณากรอกชื่อชีท";
  } else if (title.length > TITLE_MAX) {
    details.title = `ชื่อชีทต้องไม่เกิน ${TITLE_MAX} ตัวอักษร`;
  } else {
    input.title = title;
  }

  const description = str("description");
  if (description !== undefined) {
    if (description && description.length > DESCRIPTION_MAX) {
      details.description = `คำอธิบายต้องไม่เกิน ${DESCRIPTION_MAX} ตัวอักษร`;
    } else {
      input.description = description || null;
    }
  }

  for (const name of ["subjectId", "categoryId"] as const) {
    const value = str(name);
    if (value === undefined) continue;
    if (!value) input[name] = null;
    else if (!isUuid(value)) details[name] = "รูปแบบไม่ถูกต้อง";
    else input[name] = value;
  }

  const status = str("status");
  if (status) {
    if ((opts.allowedStatuses as readonly string[]).includes(status)) input.status = status as SheetStatus;
    else details.status = `ต้องเป็นหนึ่งใน ${opts.allowedStatuses.join(", ")}`;
  }

  // The ids must point to real rows (the FK would also reject them, but this gives a clear message).
  const db = getDb();
  if (input.subjectId) {
    const [found] = await db.select({ id: subjects.id }).from(subjects).where(eq(subjects.id, input.subjectId));
    if (!found) details.subjectId = "ไม่พบวิชานี้";
  }
  if (input.categoryId) {
    const [found] = await db.select({ id: categories.id }).from(categories).where(eq(categories.id, input.categoryId));
    if (!found) details.categoryId = "ไม่พบหมวดหมู่นี้";
  }

  if (Object.keys(details).length > 0) throw new ApiError("VALIDATION_ERROR", "ข้อมูลไม่ถูกต้อง", details);
  return input;
}

/** Reads the request body as fields + optional file, from either multipart/form-data or JSON. */
export async function readSheetBody(request: Request): Promise<{ fields: Record<string, unknown>; file: File | null }> {
  const type = request.headers.get("content-type") ?? "";
  if (type.includes("multipart/form-data")) {
    // Whole request may be the file plus form fields and multipart boundaries.
    return readMultipart(request, MAX_UPLOAD_BYTES + 1024 * 1024, `ไฟล์ต้องมีขนาดไม่เกิน ${MAX_UPLOAD_BYTES / 1024 / 1024} MB`);
  }
  if (type.includes("application/json")) return { fields: await readJsonObject(request), file: null };
  throw new ApiError("VALIDATION_ERROR", "Content-Type ต้องเป็น multipart/form-data หรือ application/json");
}
