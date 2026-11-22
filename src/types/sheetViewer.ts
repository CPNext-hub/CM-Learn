/** Document Viewer page data (from GET /api/v1/sheets/:id via services/sheetViewerService). */

export type SheetViewer = {
  id: string;
  title: string;
  subjectName: string;
  categoryName: string;
  previewUrl: string | null; // PDF / image shown in the viewer; null for Office files
  downloadUrl: string | null;
  fileType: string;
  isImage: boolean;
  creator: { id: string; displayName: string; avatarUrl: string | null };
  viewCount: number;
  likeCount: number;
  commentCount: number;
};
