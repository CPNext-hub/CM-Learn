import { and, eq, type SQL } from "drizzle-orm";
import { sheets, SHEET_STATUSES } from "@/db/schema";
import { ApiError, buildPagination, ok, parsePagination, requireSessionUser, withErrors } from "@/lib/api";
import { listSheets, notDeleted } from "@/lib/sheets";

/**
 * GET /api/v1/users/me/sheets — "My Sheets": every non-deleted sheet the user owns, any status.
 * Query: status=draft|published|hidden (optional), page, pageSize
 */
export const GET = withErrors(async (request: Request) => {
  const user = await requireSessionUser(request);
  const params = new URL(request.url).searchParams;
  const { page, pageSize, offset } = parsePagination(params);

  const conditions: SQL[] = [notDeleted, eq(sheets.ownerId, user.id)];
  const status = params.get("status");
  if (status) {
    if (!(SHEET_STATUSES as readonly string[]).includes(status)) {
      throw new ApiError("VALIDATION_ERROR", "status ไม่ถูกต้อง", { status: SHEET_STATUSES.join(", ") });
    }
    conditions.push(eq(sheets.status, status as (typeof SHEET_STATUSES)[number]));
  }

  const { items, total } = await listSheets({ where: and(...conditions), sort: "newest", limit: pageSize, offset });
  return ok(items, { pagination: buildPagination(page, pageSize, total) });
});
