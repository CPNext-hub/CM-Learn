import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { sheetFiles, sheetReactions, sheets } from "@/db/schema";
import { ApiError, getSessionUser, ok, parseIdParam, requireSessionUser, withErrors } from "@/lib/api";
import {
  getOwnedSheet,
  getVisibleSheet,
  latestFiles,
  parseSheetInput,
  readSheetBody,
  toSheetDto,
} from "@/lib/sheets";
import { deleteFile, saveFile, validateUpload } from "@/lib/storage";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/v1/sheets/:id — sheet detail.
 * Published sheets are public; drafts/hidden are visible to the owner only (others get 404).
 * Also returns `viewer` info so the page can show Edit buttons and the user's current reaction.
 */
export const GET = withErrors(async (request: Request, { params }: Ctx) => {
  const id = parseIdParam((await params).id);
  const viewer = await getSessionUser(request);
  const { row, isOwner } = await getVisibleSheet(id, viewer);
  const db = getDb();

  if (!isOwner) {
    // Count a view. Keep updated_at unchanged: a view is not an edit.
    await db
      .update(sheets)
      .set({ viewCount: sql`${sheets.viewCount} + 1`, updatedAt: sql`${sheets.updatedAt}` })
      .where(eq(sheets.id, id));
    row.sheet.viewCount += 1;
  }

  let reaction: "like" | "dislike" | null = null;
  if (viewer) {
    const [found] = await db
      .select({ reaction: sheetReactions.reaction })
      .from(sheetReactions)
      .where(and(eq(sheetReactions.sheetId, id), eq(sheetReactions.userId, viewer.id)));
    reaction = found?.reaction ?? null;
  }

  const files = await latestFiles([id]);
  return ok({ ...toSheetDto(row, files.get(id)), viewer: { isOwner, reaction } });
});

/**
 * PATCH /api/v1/sheets/:id — owner edits metadata and/or uploads a new file version.
 * Body: JSON { title?, description?, subjectId?, categoryId?, status? }
 *       or multipart/form-data with the same fields + optional `file` (creates version N+1).
 * status: draft | published | hidden ("hidden" = owner hides the sheet without deleting it).
 */
export const PATCH = withErrors(async (request: Request, { params }: Ctx) => {
  const id = parseIdParam((await params).id);
  const user = await requireSessionUser(request);
  await getOwnedSheet(id, user);

  const { fields, file } = await readSheetBody(request);
  const input = await parseSheetInput(fields, {
    requireTitle: false,
    allowedStatuses: ["draft", "published", "hidden"],
  });
  const validated = file ? await validateUpload(file) : null;

  if (Object.keys(input).length === 0 && !validated) {
    throw new ApiError("VALIDATION_ERROR", "ไม่มีข้อมูลที่จะแก้ไข");
  }

  const current = (await latestFiles([id])).get(id);
  if (input.status === "published" && !current && !validated) {
    throw new ApiError("VALIDATION_ERROR", "ต้องแนบไฟล์ก่อนเผยแพร่", { file: "กรุณาเลือกไฟล์" });
  }

  const storageKey = validated ? await saveFile(id, validated) : null;
  try {
    await getDb().transaction(async (tx) => {
      // updatedAt is set automatically by $onUpdate in the schema; set it explicitly when only a file changes.
      await tx
        .update(sheets)
        .set(Object.keys(input).length > 0 ? input : { updatedAt: new Date() })
        .where(eq(sheets.id, id));
      if (validated && storageKey) {
        await tx.insert(sheetFiles).values({
          sheetId: id,
          versionNo: (current?.versionNo ?? 0) + 1,
          assetType: "original",
          storageKey,
          mimeType: validated.kind.mime,
          sizeBytes: validated.bytes.byteLength,
        });
      }
    });
  } catch (error) {
    if (storageKey) await deleteFile(storageKey);
    throw error;
  }

  const { row } = await getVisibleSheet(id, user);
  const files = await latestFiles([id]);
  return ok(toSheetDto(row, files.get(id)));
});

/**
 * DELETE /api/v1/sheets/:id — owner deletes a sheet (soft delete: deleted_at is set, history is kept).
 */
export const DELETE = withErrors(async (request: Request, { params }: Ctx) => {
  const id = parseIdParam((await params).id);
  const user = await requireSessionUser(request);
  await getOwnedSheet(id, user);
  await getDb().update(sheets).set({ deletedAt: new Date() }).where(eq(sheets.id, id));
  return ok({ id, deleted: true });
});
