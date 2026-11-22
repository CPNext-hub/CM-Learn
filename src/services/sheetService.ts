import { fileLabel } from "@/lib/api-client";
import { apiOrThrow, categoryName, coverUrl, displayFileName, sheetsUrl, subjectName, type ApiSheet } from "@/services/sheetMappers";
import type { RelatedSheet, Sheet } from "@/types/sheet";

// Comments, reactions, save and follow are not provided here:
// Comment/Like/Dislike APIs belong to BE02 (not built yet); Save/Follow are not in the MVP design.

function toSheet(sheet: ApiSheet): Sheet {
  return {
    id: sheet.id,
    title: sheet.title,
    description: sheet.description ?? "",
    subjectId: sheet.subject?.id ?? null,
    subjectName: subjectName(sheet),
    category: categoryName(sheet),
    fileUrl: sheet.downloadUrl,
    previewUrl: sheet.previewUrl,
    fileType: sheet.file ? fileLabel(sheet.file.mimeType) : "",
    fileName: displayFileName(sheet),
    fileSize: sheet.file?.sizeBytes ?? 0,
    isImage: Boolean(sheet.file?.mimeType.startsWith("image/")),
    author: { id: sheet.owner.id, name: sheet.owner.name, avatarUrl: sheet.owner.image },
    stats: { views: sheet.viewCount, likes: sheet.likeCount, dislikes: sheet.dislikeCount, comments: sheet.commentCount },
    myReaction: sheet.viewer?.reaction ?? null,
    isOwner: sheet.viewer?.isOwner ?? false,
    updatedAt: sheet.updatedAt,
  };
}

/** GET /api/v1/sheets/:id (counts one view for non-owners). */
export async function getSheet(id: string): Promise<Sheet> {
  const result = await apiOrThrow<ApiSheet>(`/api/v1/sheets/${encodeURIComponent(id)}`);
  return toSheet(result.data);
}

/** Other published sheets of the same subject: GET /api/v1/sheets?subjectId=… */
export async function getRelatedSheets(sheet: Sheet): Promise<RelatedSheet[]> {
  if (!sheet.subjectId) return [];
  const result = await apiOrThrow<ApiSheet[]>(sheetsUrl({ subjectId: sheet.subjectId, sort: "popular", pageSize: 4 }));
  return result.data
    .filter((item) => item.id !== sheet.id)
    .slice(0, 3)
    .map((item) => ({
      id: item.id,
      title: item.title,
      subjectName: subjectName(item),
      thumbnailUrl: coverUrl(item),
      views: item.viewCount,
      likes: item.likeCount,
    }));
}
