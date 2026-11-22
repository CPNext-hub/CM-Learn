// Browser-side helpers for calling the /api/v1 backend. Shapes match docs/API.md.

export type Lookup = { id: string; name: string };
export type SheetStatus = "draft" | "published" | "hidden";

export type Sheet = {
  id: string;
  title: string;
  description: string | null;
  status: SheetStatus;
  viewCount: number;
  likeCount: number;
  dislikeCount: number;
  commentCount: number;
  owner: { id: string; name: string; image: string | null };
  subject: Lookup | null;
  category: Lookup | null;
  file: { mimeType: string; sizeBytes: number; versionNo: number } | null;
  previewUrl: string | null;
  downloadUrl: string | null;
  createdAt: string;
  updatedAt: string;
  viewer?: { isOwner: boolean; reaction: "like" | "dislike" | null };
};

export type Profile = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  bio: string | null;
  role: string;
  createdAt: string;
  stats: { sheetCount: number; publishedCount: number; totalViews: number; likeCount: number };
};

export type Pagination = { page: number; pageSize: number; total: number; totalPages: number };
export type ApiErrorBody = { code: string; message: string; details?: Record<string, string> };
export type ApiResult<T> =
  | { ok: true; status: number; data: T; pagination?: Pagination }
  | { ok: false; status: number; error: ApiErrorBody };

/** fetch + our standard { data } / { error } shape, so pages only handle "ok" or "error". */
export async function api<T>(url: string, init?: RequestInit): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, init);
    const body = await res.json().catch(() => ({}));
    if (res.ok) return { ok: true, status: res.status, data: body.data, pagination: body.pagination };
    return { ok: false, status: res.status, error: body.error ?? { code: "UNKNOWN", message: "เกิดข้อผิดพลาด กรุณาลองอีกครั้ง" } };
  } catch {
    return { ok: false, status: 0, error: { code: "NETWORK", message: "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้" } };
  }
}

/** JSON request helper (PATCH/POST with a JSON body). */
export const jsonInit = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

/** One readable line from an API error, including per-field details. */
export function errorText(error: ApiErrorBody) {
  const details = error.details ? Object.values(error.details).join(" · ") : "";
  return details && details !== error.message ? `${error.message}: ${details}` : error.message;
}

export const STATUS_LABEL: Record<SheetStatus, string> = { published: "เผยแพร่", draft: "ร่าง", hidden: "ซ่อน" };

/** File types accepted by POST /api/v1/sheets (checked again on the server by real content). */
export const SHEET_ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.gif,.docx,.pptx,.xlsx";
export const SHEET_MAX_BYTES = 50 * 1024 * 1024;
export const AVATAR_ACCEPT = ".png,.jpg,.jpeg,.webp";
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

export function sizeLabel(size: number | null | undefined) {
  if (size == null) return "—";
  return size >= 1024 * 1024 ? `${(size / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(size / 1024))} KB`;
}

/** Short label for a file type, e.g. "PDF", "DOCX", "PNG". */
export function fileLabel(mimeType: string | null | undefined) {
  if (!mimeType) return "FILE";
  if (mimeType === "application/pdf") return "PDF";
  if (mimeType.startsWith("image/")) return mimeType.slice(6).toUpperCase().replace("JPEG", "JPG");
  if (mimeType.includes("wordprocessing")) return "DOCX";
  if (mimeType.includes("presentation")) return "PPTX";
  if (mimeType.includes("spreadsheet")) return "XLSX";
  return "FILE";
}

/** Loads subjects and categories (for dropdowns). */
export async function loadLookups() {
  const [subjects, categories] = await Promise.all([api<Lookup[]>("/api/v1/subjects"), api<Lookup[]>("/api/v1/categories")]);
  return { subjects: subjects.ok ? subjects.data : [], categories: categories.ok ? categories.data : [] };
}

/** Initials for an avatar placeholder, e.g. "PA NU" → "PN". */
export const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "?";
