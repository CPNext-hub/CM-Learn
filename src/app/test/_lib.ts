// Small client-side helpers shared by the /test pages. FE can copy the `api()` idea for the real UI.

export type Lookup = { id: string; name: string };

export type Sheet = {
  id: string;
  title: string;
  description: string | null;
  status: "draft" | "published" | "hidden";
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

export type Pagination = { page: number; pageSize: number; total: number; totalPages: number };
export type ApiErrorBody = { code: string; message: string; details?: Record<string, string> };

export type ApiResult<T> =
  | { ok: true; status: number; data: T; pagination?: Pagination }
  | { ok: false; status: number; error: ApiErrorBody };

/** fetch + parse our standard { data } / { error } shape, so pages only handle two cases. */
export async function api<T>(url: string, init?: RequestInit): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, init);
    const body = await res.json();
    if (res.ok) return { ok: true, status: res.status, data: body.data, pagination: body.pagination };
    return { ok: false, status: res.status, error: body.error ?? { code: "UNKNOWN", message: res.statusText } };
  } catch {
    return { ok: false, status: 0, error: { code: "NETWORK", message: "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้" } };
  }
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export const formatDate = (iso: string) => new Date(iso).toLocaleString("th-TH");

export const STATUS_LABEL: Record<Sheet["status"], string> = {
  draft: "ร่าง",
  published: "เผยแพร่",
  hidden: "ซ่อน",
};

export const ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.gif,.docx,.pptx,.xlsx";
