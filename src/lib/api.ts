import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";

// ---------------------------------------------------------------------------
// Standard response shapes shared by every /api/v1 route (FE relies on these).
//   success: { data: ... }                 (+ { pagination } for lists)
//   error:   { error: { code, message, details? } }
// ---------------------------------------------------------------------------

export type ErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "FILE_TOO_LARGE"
  | "UNSUPPORTED_FILE_TYPE"
  | "INTERNAL_ERROR";

const STATUS: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  FILE_TOO_LARGE: 413,
  UNSUPPORTED_FILE_TYPE: 415,
  INTERNAL_ERROR: 500,
};

/** Throw this anywhere inside a handler; withErrors() turns it into a JSON error response. */
export class ApiError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public details?: Record<string, string>,
  ) {
    super(message);
  }
}

export function ok<T>(data: T, init?: { status?: number; pagination?: Pagination }) {
  const body = init?.pagination ? { data, pagination: init.pagination } : { data };
  return NextResponse.json(body, { status: init?.status ?? 200 });
}

export function errorResponse(error: ApiError) {
  return NextResponse.json(
    { error: { code: error.code, message: error.message, ...(error.details && { details: error.details }) } },
    { status: STATUS[error.code] },
  );
}

/**
 * Wraps a route handler so that:
 * - ApiError becomes the matching 4xx/5xx JSON response
 * - any unexpected error is logged and returned as a generic 500 (no internal details leak to the client)
 */
export function withErrors<Args extends unknown[]>(handler: (...args: Args) => Promise<Response>) {
  return async (...args: Args): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (error) {
      if (error instanceof ApiError) return errorResponse(error);
      console.error("[api] unexpected error", error);
      return errorResponse(new ApiError("INTERNAL_ERROR", "เกิดข้อผิดพลาดภายในระบบ"));
    }
  };
}

// ---------------------------------------------------------------------------
// Auth helpers for API routes
// ---------------------------------------------------------------------------

export type SessionUser = { id: string; name: string; role: string };

/** Current user, or null for guests. Soft-deleted accounts are treated as guests. */
export async function getSessionUser(request: Request): Promise<SessionUser | null> {
  const auth = await getAuth();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session || session.user.deletedAt) return null;
  return { id: session.user.id, name: session.user.name, role: session.user.role ?? "user" };
}

/** Current user, or throw 401. Use in every route that changes data. */
export async function requireSessionUser(request: Request): Promise<SessionUser> {
  const user = await getSessionUser(request);
  if (!user) throw new ApiError("UNAUTHORIZED", "กรุณาเข้าสู่ระบบ");
  return user;
}

// ---------------------------------------------------------------------------
// Input helpers
// ---------------------------------------------------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: string) => UUID_RE.test(value);

/** Validates a route param id; an invalid id can never exist, so answer 404 like a missing row. */
export function parseIdParam(id: string): string {
  if (!isUuid(id)) throw new ApiError("NOT_FOUND", "ไม่พบข้อมูล");
  return id;
}

export type Pagination = { page: number; pageSize: number; total: number; totalPages: number };

export function parsePagination(params: URLSearchParams, defaults = { pageSize: 12, maxPageSize: 50 }) {
  const page = Math.max(1, Number.parseInt(params.get("page") ?? "1", 10) || 1);
  const rawSize = Number.parseInt(params.get("pageSize") ?? String(defaults.pageSize), 10) || defaults.pageSize;
  const pageSize = Math.min(Math.max(1, rawSize), defaults.maxPageSize);
  return { page, pageSize, offset: (page - 1) * pageSize };
}

export function buildPagination(page: number, pageSize: number, total: number): Pagination {
  return { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

// ---------------------------------------------------------------------------
// Reading request bodies safely (size-limited)
// ---------------------------------------------------------------------------

const MAX_JSON_BYTES = 64 * 1024;

/**
 * Reads the raw body but stops as soon as it exceeds `limit`, throwing `tooLarge`.
 * Without this, request.formData() would buffer a 2 GB upload in memory BEFORE we could check its size.
 */
export async function readBodyWithLimit(
  request: Request,
  limit: number,
  tooLarge: ApiError,
): Promise<Uint8Array<ArrayBuffer>> {
  // Fast path: an honest client tells us the size up front.
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > limit) throw tooLarge;
  if (!request.body) return new Uint8Array();

  // Slow path: count bytes while reading (Content-Length can be missing or a lie).
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > limit) {
      await reader.cancel();
      throw tooLarge;
    }
    chunks.push(value);
  }
  const body = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

/** Reads a multipart/form-data body (at most `maxBytes`) into text fields + the `file` field. */
export async function readMultipart(
  request: Request,
  maxBytes: number,
  tooLargeMessage: string,
): Promise<{ fields: Record<string, unknown>; file: File | null }> {
  const type = request.headers.get("content-type") ?? "";
  if (!type.includes("multipart/form-data")) {
    throw new ApiError("VALIDATION_ERROR", "Content-Type ต้องเป็น multipart/form-data");
  }
  const raw = await readBodyWithLimit(request, maxBytes, new ApiError("FILE_TOO_LARGE", tooLargeMessage));
  // Parse the bounded bytes with the same multipart parser the platform uses.
  const form = await new Response(raw, { headers: { "content-type": type } }).formData().catch(() => {
    throw new ApiError("VALIDATION_ERROR", "ข้อมูล multipart ไม่ถูกต้อง");
  });
  const fields: Record<string, unknown> = {};
  let file: File | null = null;
  for (const [key, value] of form.entries()) {
    if (key === "file") {
      if (typeof value !== "string" && value.size > 0) file = value;
    } else if (typeof value === "string") {
      fields[key] = value;
    }
  }
  return { fields, file };
}

/** Reads a JSON object body (at most 64 KB). */
export async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
  if (!(request.headers.get("content-type") ?? "").includes("application/json")) {
    throw new ApiError("VALIDATION_ERROR", "Content-Type ต้องเป็น application/json");
  }
  const raw = await readBodyWithLimit(request, MAX_JSON_BYTES, new ApiError("VALIDATION_ERROR", "ข้อมูลใหญ่เกินไป"));
  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder().decode(raw));
  } catch {
    throw new ApiError("VALIDATION_ERROR", "JSON ไม่ถูกต้อง");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ApiError("VALIDATION_ERROR", "body ต้องเป็น JSON object");
  }
  return body as Record<string, unknown>;
}

/** Optional uuid filter from the query string: undefined when absent, 400 when malformed. */
export function optionalUuidParam(params: URLSearchParams, name: string): string | undefined {
  const value = params.get(name)?.trim();
  if (!value) return undefined;
  if (!isUuid(value)) throw new ApiError("VALIDATION_ERROR", `${name} ไม่ถูกต้อง`, { [name]: "ต้องเป็น UUID" });
  return value;
}
