import { ApiError, getSessionUser, parseIdParam, withErrors } from "@/lib/api";
import { getVisibleSheet, latestFiles } from "@/lib/sheets";
import { kindForMime, openFile } from "@/lib/storage";

type Ctx = { params: Promise<{ id: string }> };

/** Turns the sheet title into a safe file name (no path characters, no control characters). */
function safeFileName(title: string, ext: string) {
  const base =
    title
      .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 100) || "sheet";
  return base + ext;
}

/**
 * GET /api/v1/sheets/:id/download — download the latest file (same access rules as the detail page).
 * GET /api/v1/sheets/:id/download?inline=1 — show it in the browser (Preview), only for PDF and images.
 *
 * The file goes through this route instead of a public folder so that:
 * - permissions are checked on every request (drafts stay private)
 * - the storage key / disk path is never revealed to the client
 */
export const GET = withErrors(async (request: Request, { params }: Ctx) => {
  const id = parseIdParam((await params).id);
  const viewer = await getSessionUser(request);
  const { row } = await getVisibleSheet(id, viewer);

  const file = (await latestFiles([id])).get(id);
  if (!file) throw new ApiError("NOT_FOUND", "ชีทนี้ยังไม่มีไฟล์");
  const opened = await openFile(file.storageKey);
  if (!opened) {
    console.error(`[download] file missing on disk for sheet ${id}`);
    throw new ApiError("NOT_FOUND", "ไม่พบไฟล์");
  }

  const kind = kindForMime(file.mimeType);
  const wantsInline = new URL(request.url).searchParams.get("inline") === "1";
  const disposition = wantsInline && kind?.inlineSafe ? "inline" : "attachment";

  // Thai names need RFC 5987 (filename*=UTF-8''...); `filename=` is an ASCII fallback for old clients.
  const fileName = safeFileName(row.sheet.title, kind?.ext ?? "");
  const asciiFallback = fileName.replace(/[^\x20-\x7e]/g, "_");

  // Stream the file instead of loading it into memory. Note: Next.js re-sends route handler bodies with
  // Transfer-Encoding: chunked and drops Content-Length; the UI should show size from sheet.file.sizeBytes.
  return new Response(opened.stream, {
    headers: {
      "Content-Type": file.mimeType,
      "Content-Length": String(opened.size),
      "Content-Disposition": `${disposition}; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "X-Content-Type-Options": "nosniff", // browser must not guess a different (dangerous) type
      "Cache-Control": "private, no-store", // drafts must not be cached by shared caches
    },
  });
});
