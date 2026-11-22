import { fileLabel } from "@/lib/api-client";
import { apiOrThrow, categoryName, subjectName, type ApiSheet } from "@/services/sheetMappers";
import type { SheetViewer } from "@/types/sheetViewer";

// Page images, reactions, comments and follow are not available from the backend yet:
// the viewer shows the real file (PDF/image) instead of per-page images.

/** GET /api/v1/sheets/:id mapped for the viewer. */
export async function getSheetViewer(sheetId: string): Promise<SheetViewer> {
  const { data: sheet } = await apiOrThrow<ApiSheet>(`/api/v1/sheets/${encodeURIComponent(sheetId)}`);
  return {
    id: sheet.id,
    title: sheet.title,
    subjectName: subjectName(sheet),
    categoryName: categoryName(sheet),
    previewUrl: sheet.previewUrl,
    downloadUrl: sheet.downloadUrl,
    fileType: sheet.file ? fileLabel(sheet.file.mimeType) : "",
    isImage: Boolean(sheet.file?.mimeType.startsWith("image/")),
    creator: { id: sheet.owner.id, displayName: sheet.owner.name, avatarUrl: sheet.owner.image },
    viewCount: sheet.viewCount,
    likeCount: sheet.likeCount,
    commentCount: sheet.commentCount,
  };
}
