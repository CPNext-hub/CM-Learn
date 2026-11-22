/** Sheet Detail page data (from GET /api/v1/sheets/:id via services/sheetService). */

export interface Sheet {
  id: string;
  title: string;
  description: string;
  subjectId: string | null;
  subjectName: string;
  category: string;
  fileUrl: string | null; // download link
  previewUrl: string | null; // inline preview (PDF / image only)
  fileType: string; // "PDF", "PNG", "DOCX"…
  fileName: string;
  fileSize: number;
  isImage: boolean;
  author: { id: string; name: string; avatarUrl: string | null };
  stats: { views: number; likes: number; dislikes: number; comments: number };
  myReaction: "like" | "dislike" | null;
  isOwner: boolean;
  updatedAt: string;
}

export interface RelatedSheet {
  id: string;
  title: string;
  subjectName: string;
  thumbnailUrl: string | null;
  views: number;
  likes: number;
}
