import { randomUUID } from "node:crypto";
import { and, eq, type SQL } from "drizzle-orm";
import { getDb } from "@/db/client";
import { sheetFiles, sheets } from "@/db/schema";
import {
  ApiError,
  buildPagination,
  ok,
  optionalUuidParam,
  parsePagination,
  requireSessionUser,
  withErrors,
} from "@/lib/api";
import {
  getVisibleSheet,
  latestFiles,
  listSheets,
  notDeleted,
  parseSheetInput,
  readSheetBody,
  searchCondition,
  toSheetDto,
} from "@/lib/sheets";
import { deleteFile, saveFile, validateUpload } from "@/lib/storage";

/**
 * GET /api/v1/sheets — public list of PUBLISHED sheets (Home, Search, Filter)
 * Query: q, subjectId, categoryId, sort=newest|popular, page, pageSize
 */
export const GET = withErrors(async (request: Request) => {
  const params = new URL(request.url).searchParams;
  const { page, pageSize, offset } = parsePagination(params);
  const q = params.get("q")?.trim().slice(0, 100);
  const subjectId = optionalUuidParam(params, "subjectId");
  const categoryId = optionalUuidParam(params, "categoryId");
  const sort = params.get("sort") === "popular" ? "popular" : "newest";

  const conditions: SQL[] = [notDeleted, eq(sheets.status, "published")];
  if (q) conditions.push(searchCondition(q));
  if (subjectId) conditions.push(eq(sheets.subjectId, subjectId));
  if (categoryId) conditions.push(eq(sheets.categoryId, categoryId));

  const { items, total } = await listSheets({ where: and(...conditions), sort, limit: pageSize, offset });
  return ok(items, { pagination: buildPagination(page, pageSize, total) });
});

/**
 * POST /api/v1/sheets — create a sheet (login required)
 * Body: multipart/form-data with fields title, description, subjectId, categoryId, status (draft|published)
 *       and `file`. A published sheet must have a file; a draft may be saved without one.
 */
export const POST = withErrors(async (request: Request) => {
  const user = await requireSessionUser(request);
  const { fields, file } = await readSheetBody(request);
  const input = await parseSheetInput(fields, { requireTitle: true, allowedStatuses: ["draft", "published"] });
  const status = input.status ?? "published";

  if (status === "published" && !file) {
    throw new ApiError("VALIDATION_ERROR", "ต้องแนบไฟล์ก่อนเผยแพร่", { file: "กรุณาเลือกไฟล์" });
  }
  const validated = file ? await validateUpload(file) : null;

  // Save the file first, then write both rows in ONE transaction.
  // If the database fails, remove the saved file so no orphan file is left on disk.
  const sheetId = randomUUID();
  const storageKey = validated ? await saveFile(`sheets/${sheetId}`, validated) : null;
  try {
    await getDb().transaction(async (tx) => {
      await tx.insert(sheets).values({
        id: sheetId,
        ownerId: user.id,
        title: input.title!,
        description: input.description ?? null,
        subjectId: input.subjectId ?? null,
        categoryId: input.categoryId ?? null,
        status,
      });
      if (validated && storageKey) {
        await tx.insert(sheetFiles).values({
          sheetId,
          versionNo: 1,
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

  const { row } = await getVisibleSheet(sheetId, user);
  const files = await latestFiles([sheetId]);
  return ok(toSheetDto(row, files.get(sheetId)), { status: 201 });
});
