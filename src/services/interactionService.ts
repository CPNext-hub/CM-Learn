// Adapter for BE02's Interaction API (src/app/api/v1/[[...path]]/route.ts):
// comments + replies, like/dislike and favorites. Pages get Thai errors and FE01-friendly shapes.
import { api, jsonInit, type ApiErrorBody } from "@/lib/api-client";
import type { Reaction, ReactionState, SheetComment } from "@/types/interaction";

// BE02 answers in English; show Thai to users (unknown messages fall back by status code).
const THAI: Record<string, string> = {
  "Authentication required.": "กรุณาเข้าสู่ระบบก่อน",
  "Sheet not found.": "ไม่พบชีทนี้ หรือชีทถูกลบไปแล้ว",
  "Comment not found.": "ไม่พบความคิดเห็นนี้",
  "Comment body is required.": "กรุณาพิมพ์ความคิดเห็น",
  "Reply body is required.": "กรุณาพิมพ์ข้อความตอบกลับ",
  "Comment body must be 5,000 characters or fewer.": "ความคิดเห็นยาวได้ไม่เกิน 5,000 ตัวอักษร",
  "Reply body must be 5,000 characters or fewer.": "ข้อความตอบกลับยาวได้ไม่เกิน 5,000 ตัวอักษร",
  "A reply can only target an active top-level comment.": "ตอบกลับได้เฉพาะความคิดเห็นหลักที่ยังไม่ถูกลบ",
  "Comment not found or not owned by you.": "ลบได้เฉพาะความคิดเห็นของตัวเอง",
  "Reaction must be 'like' or 'dislike'.": "รูปแบบการกดถูกใจไม่ถูกต้อง",
};

function thaiError(status: number, error: ApiErrorBody) {
  if (status === 0) return error.message; // network error: already Thai
  if (THAI[error.message]) return THAI[error.message];
  if (status === 401) return THAI["Authentication required."];
  if (status === 404) return "ไม่พบข้อมูล หรือถูกลบไปแล้ว";
  if (status >= 500) return "ระบบขัดข้อง กรุณาลองอีกครั้ง";
  return "ทำรายการไม่สำเร็จ กรุณาลองอีกครั้ง";
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const result = await api<T>(url, init);
  if (!result.ok) throw new Error(thaiError(result.status, result.error));
  return result.data;
}

type ApiComment = {
  id: string;
  authorId: string;
  authorName: string;
  authorImage: string | null;
  body: string;
  deleted: boolean;
  createdAt: string;
  replies?: ApiComment[];
};

const toComment = (c: ApiComment): SheetComment => ({
  id: c.id,
  authorId: c.authorId,
  authorName: c.authorName,
  authorImage: c.authorImage,
  body: c.body,
  deleted: c.deleted,
  createdAt: c.createdAt,
  replies: (c.replies ?? []).map(toComment),
});

const sheetPath = (sheetId: string) => `/api/v1/sheets/${encodeURIComponent(sheetId)}`;
const commentPath = (commentId: string) => `/api/v1/comments/${encodeURIComponent(commentId)}`;

/** GET /sheets/:id/comments: top-level comments (oldest first), each with its replies. */
export async function getComments(sheetId: string): Promise<SheetComment[]> {
  return (await call<ApiComment[]>(`${sheetPath(sheetId)}/comments`)).map(toComment);
}

/** Comments still visible (deleted ones are kept only as placeholders for their replies). */
export function countComments(comments: SheetComment[]) {
  return comments.reduce((n, c) => n + (c.deleted ? 0 : 1) + c.replies.filter((r) => !r.deleted).length, 0);
}

export async function addComment(sheetId: string, body: string) {
  await call(`${sheetPath(sheetId)}/comments`, jsonInit("POST", { body }));
}

export async function replyToComment(commentId: string, body: string) {
  await call(`${commentPath(commentId)}/replies`, jsonInit("POST", { body }));
}

/** Soft delete (author only): the text disappears, replies stay. */
export async function deleteComment(commentId: string) {
  await call(commentPath(commentId), { method: "DELETE" });
}

/**
 * Clicking the reaction you already have removes it; clicking the other one switches.
 * POST returns fresh counts; DELETE does not, so its counts are worked out from the current state.
 */
export async function toggleReaction(sheetId: string, clicked: Reaction, current: ReactionState): Promise<ReactionState> {
  if (current.mine === clicked) {
    await call(`${sheetPath(sheetId)}/reactions`, { method: "DELETE" });
    return {
      likes: current.likes - (clicked === "like" ? 1 : 0),
      dislikes: current.dislikes - (clicked === "dislike" ? 1 : 0),
      mine: null,
    };
  }
  const data = await call<{ likes: number; dislikes: number }>(`${sheetPath(sheetId)}/reactions`, jsonInit("POST", { reaction: clicked }));
  return { likes: data.likes, dislikes: data.dislikes, mine: clicked };
}

/** IDs of the signed-in user's saved sheets (GET /favorites). Guests have none. */
export async function getFavoriteIds(): Promise<Set<string>> {
  const result = await api<{ id: string }[]>("/api/v1/favorites");
  if (!result.ok) {
    if (result.status === 401) return new Set();
    throw new Error(thaiError(result.status, result.error));
  }
  return new Set(result.data.map((s) => s.id));
}

export async function setFavorite(sheetId: string, saved: boolean) {
  await call(`/api/v1/favorites/${encodeURIComponent(sheetId)}`, { method: saved ? "POST" : "DELETE" });
}
