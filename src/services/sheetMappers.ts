// Adapters: turn the backend's Sheet (GET /api/v1/sheets…) into the shapes FE01's pages were built on.
// Fields the backend does not have (rating, downloads, page count, tags…) get neutral values here,
// and the pages hide the parts of the UI that would show them.
import { api, errorText, fileLabel, type Sheet as ApiSheet } from "@/lib/api-client";

export type { ApiSheet };

/** Calls the API and throws a readable Error on failure (FE01's pages expect services to throw). */
export async function apiOrThrow<T>(url: string, init?: RequestInit) {
  const result = await api<T>(url, init);
  if (!result.ok) throw new Error(errorText(result.error));
  return result;
}

/** Image files can be used directly as a cover picture; PDFs and Office files cannot. */
export function coverUrl(sheet: ApiSheet): string | null {
  return sheet.file?.mimeType.startsWith("image/") ? sheet.previewUrl : null;
}

export const subjectName = (sheet: ApiSheet) => sheet.subject?.name ?? "ไม่ระบุวิชา";
export const categoryName = (sheet: ApiSheet) => sheet.category?.name ?? "ทั่วไป";

/** File name shown to the user: sheet title + extension of the stored file. */
export function displayFileName(sheet: ApiSheet) {
  return sheet.file ? `${sheet.title}.${fileLabel(sheet.file.mimeType).toLowerCase()}` : sheet.title;
}

/** Builds /api/v1/sheets?… from optional filters (empty values are left out). */
export function sheetsUrl(params: Record<string, string | number | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  return `/api/v1/sheets?${search}`;
}
