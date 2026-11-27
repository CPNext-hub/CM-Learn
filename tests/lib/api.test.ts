// src/lib/api.ts — เครื่องมือกลางที่ทุก route ใน /api/v1 ใช้
// ก. รูปแบบคำตอบ (ok / errorResponse / withErrors)
// ข. ผู้ใช้จาก cookie (getSessionUser / requireSessionUser) — ใช้ DB จริง
// ค. อ่านค่าจาก URL (pagination / uuid)
// ง. readBodyWithLimit — อ่าน body แบบจำกัดขนาด
// จ. readMultipart
// ฉ. readJsonObject
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, test, vi } from "vitest";
import { user } from "@/db/schema";
import {
  ApiError,
  buildPagination,
  errorResponse,
  ok,
  optionalUuidParam,
  parseIdParam,
  parsePagination,
  readBodyWithLimit,
  readJsonObject,
  readMultipart,
  requireSessionUser,
  getSessionUser,
  withErrors,
  type ErrorCode,
} from "@/lib/api";
import { signUpAdmin, signUpUser } from "../helpers/auth";
import { cleanDbBeforeAll, testDb } from "../helpers/db";
import { json, request } from "../helpers/request";

cleanDbBeforeAll();

afterEach(() => {
  vi.restoreAllMocks();
});

const bytes = (n: number, fill = 97) => new Uint8Array(n).fill(fill);

/** จับ error ที่ async function โยนออกมา เพื่อตรวจ code / message / details */
async function caught(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    return error as ApiError;
  }
  throw new Error("ควรโยน ApiError แต่ไม่โยน");
}

// ---------------------------------------------------------------------------
// ก. ok / errorResponse / withErrors
// ---------------------------------------------------------------------------

describe("ok", () => {
  test("ok(data) → 200 และ body มีแค่ { data } ไม่มี pagination", async () => {
    const res = ok({ id: 1 });
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ data: { id: 1 } });
  });

  test("ok แบบ status 201 + pagination → ส่ง pagination กลับด้วย", async () => {
    const pagination = { page: 2, pageSize: 10, total: 25, totalPages: 3 };
    const res = ok([1, 2], { status: 201, pagination });
    expect(res.status).toBe(201);
    expect(await json(res)).toEqual({ data: [1, 2], pagination });
  });
});

describe("errorResponse", () => {
  test.each<[ErrorCode, number]>([
    ["VALIDATION_ERROR", 400],
    ["UNAUTHORIZED", 401],
    ["FORBIDDEN", 403],
    ["NOT_FOUND", 404],
    ["FILE_TOO_LARGE", 413],
    ["UNSUPPORTED_FILE_TYPE", 415],
    ["INTERNAL_ERROR", 500],
  ])("%s → status %i", async (code, status) => {
    const res = errorResponse(new ApiError(code, "ข้อความ"));
    expect(res.status).toBe(status);
    expect((await json(res)).error).toMatchObject({ code, message: "ข้อความ" });
  });

  test("มี details → ส่ง details กลับ", async () => {
    const res = errorResponse(new ApiError("VALIDATION_ERROR", "ข้อมูลไม่ถูกต้อง", { title: "ห้ามว่าง" }));
    expect(await json(res)).toEqual({
      error: { code: "VALIDATION_ERROR", message: "ข้อมูลไม่ถูกต้อง", details: { title: "ห้ามว่าง" } },
    });
  });

  test("ไม่มี details → ไม่มีคีย์ details ใน body", async () => {
    const body = await json(errorResponse(new ApiError("NOT_FOUND", "ไม่พบข้อมูล")));
    expect(body.error).not.toHaveProperty("details");
  });
});

describe("withErrors", () => {
  test("handler สำเร็จ → ส่ง Response เดิมผ่านไป และได้ argument ครบ", async () => {
    const handler = vi.fn(async (a: string, b: number) => ok({ a, b }));
    const res = await withErrors(handler)("x", 1);
    expect(handler).toHaveBeenCalledWith("x", 1);
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ data: { a: "x", b: 1 } });
  });

  test("handler โยน ApiError → ได้ JSON error ตาม code", async () => {
    const res = await withErrors(async () => {
      throw new ApiError("FORBIDDEN", "ไม่มีสิทธิ์");
    })();
    expect(res.status).toBe(403);
    expect(await json(res)).toEqual({ error: { code: "FORBIDDEN", message: "ไม่มีสิทธิ์" } });
  });

  test("handler โยน error อื่น → 500 ข้อความกลาง ไม่หลุดรายละเอียด และ log ไว้", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const secret = new Error("connect ECONNREFUSED db-password=hunter2");

    const res = await withErrors(async () => {
      throw secret;
    })();

    expect(res.status).toBe(500);
    const body = await json(res);
    expect(body).toEqual({ error: { code: "INTERNAL_ERROR", message: "เกิดข้อผิดพลาดภายในระบบ" } });
    expect(JSON.stringify(body)).not.toContain("hunter2");
    expect(log).toHaveBeenCalledWith("[api] unexpected error", secret);
  });
});

// ---------------------------------------------------------------------------
// ข. ผู้ใช้จาก cookie (DB จริง)
// ---------------------------------------------------------------------------

describe("getSessionUser / requireSessionUser", () => {
  test("ไม่มี cookie → null", async () => {
    expect(await getSessionUser(request("/api/v1/x"))).toBeNull();
  });

  test("ผู้ใช้ทั่วไปล็อกอิน → { id, name, role: 'user' }", async () => {
    const alice = await signUpUser({ name: "Alice" });
    expect(await getSessionUser(request("/api/v1/x", { cookie: alice.cookie }))).toEqual({
      id: alice.id,
      name: "Alice",
      role: "user",
    });
  });

  test("อีเมลอยู่ใน ADMIN_EMAILS → role 'admin'", async () => {
    const admin = await signUpAdmin();
    const me = await getSessionUser(request("/api/v1/x", { cookie: admin.cookie }));
    expect(me).toMatchObject({ id: admin.id, role: "admin" });
  });

  test("บัญชีถูกลบ (deletedAt) แม้ cookie ยังใช้ได้ → null (เป็น guest)", async () => {
    const bob = await signUpUser();
    await testDb().update(user).set({ deletedAt: new Date() }).where(eq(user.id, bob.id));
    expect(await getSessionUser(request("/api/v1/x", { cookie: bob.cookie }))).toBeNull();
  });

  test("requireSessionUser ของ guest → ApiError UNAUTHORIZED (401)", async () => {
    const error = await caught(requireSessionUser(request("/api/v1/x")));
    expect(error.code).toBe("UNAUTHORIZED");
    expect(error.message).toBe("กรุณาเข้าสู่ระบบ");
  });

  test("requireSessionUser ที่ล็อกอินแล้ว → คืนผู้ใช้", async () => {
    const carol = await signUpUser({ name: "Carol" });
    expect(await requireSessionUser(request("/api/v1/x", { cookie: carol.cookie }))).toEqual({
      id: carol.id,
      name: "Carol",
      role: "user",
    });
  });
});

// ---------------------------------------------------------------------------
// ค. อ่านค่าจาก URL
// ---------------------------------------------------------------------------

describe("parsePagination / buildPagination", () => {
  test.each(["0", "-3", "abc"])("page=%s → หน้า 1", (page) => {
    expect(parsePagination(new URLSearchParams({ page }))).toEqual({ page: 1, pageSize: 12, offset: 0 });
  });

  test("pageSize ติดลบ → 1", () => {
    expect(parsePagination(new URLSearchParams("pageSize=-5")).pageSize).toBe(1);
  });

  test("pageSize เกิน maxPageSize ที่กำหนด → ถูกจำกัดที่ max", () => {
    expect(parsePagination(new URLSearchParams("pageSize=100"), { pageSize: 5, maxPageSize: 20 }).pageSize).toBe(20);
  });

  test("pageSize=0 → ใช้ค่าเริ่มต้น 12 (เพราะ 0 || 12) — พฤติกรรมปัจจุบันของโค้ด", () => {
    expect(parsePagination(new URLSearchParams("pageSize=0")).pageSize).toBe(12);
  });

  test("ใช้ defaults ที่กำหนดเอง → pageSize ตามที่ตั้ง และ offset ถูก", () => {
    expect(parsePagination(new URLSearchParams("page=4"), { pageSize: 5, maxPageSize: 20 })).toEqual({
      page: 4,
      pageSize: 5,
      offset: 15,
    });
  });

  test("buildPagination: ไม่มีข้อมูลเลย → totalPages อย่างน้อย 1", () => {
    expect(buildPagination(1, 12, 0)).toEqual({ page: 1, pageSize: 12, total: 0, totalPages: 1 });
  });
});

describe("parseIdParam / optionalUuidParam", () => {
  const id = "6f1c2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f";

  test("parseIdParam: uuid ถูกต้อง → คืน id เดิม", () => {
    expect(parseIdParam(id)).toBe(id);
  });

  test("optionalUuidParam: มีช่องว่างรอบ uuid → ตัดช่องว่างแล้วคืนค่า", () => {
    expect(optionalUuidParam(new URLSearchParams({ subjectId: `  ${id}  ` }), "subjectId")).toBe(id);
  });
});

// ---------------------------------------------------------------------------
// ง. readBodyWithLimit
// ---------------------------------------------------------------------------

/**
 * Request ปลอมที่ body เป็น stream ที่เราคุมเอง — นับได้ว่าถูกอ่าน (pull) กี่ครั้ง และถูก cancel ไหม
 * highWaterMark: 0 = stream จะไม่อ่านล่วงหน้าเอง จนกว่าโค้ดจะเรียก read()
 */
function streamRequest(chunks: Uint8Array[], headers: Record<string, string> = {}) {
  const pull = vi.fn();
  const cancel = vi.fn();
  let i = 0;
  const body = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        pull();
        if (i < chunks.length) controller.enqueue(chunks[i++]);
        else controller.close();
      },
      cancel,
    },
    { highWaterMark: 0 },
  );
  return { request: { headers: new Headers(headers), body } as unknown as Request, pull, cancel };
}

describe("readBodyWithLimit", () => {
  const tooLarge = new ApiError("FILE_TOO_LARGE", "ใหญ่เกิน");

  test("Content-Length บอกว่าเกิน limit → โยน error ตัวที่ส่งเข้าไป โดยไม่อ่าน body เลย", async () => {
    const { request: req, pull } = streamRequest([bytes(100)], { "content-length": "100" });
    await expect(readBodyWithLimit(req, 10, tooLarge)).rejects.toBe(tooLarge);
    expect(pull).not.toHaveBeenCalled();
  });

  test("ไม่มี body → Uint8Array ว่าง", async () => {
    const result = await readBodyWithLimit(request("/x"), 10, tooLarge);
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.byteLength).toBe(0);
  });

  test("หลายก้อนรวมกันไม่เกิน limit → ได้ไบต์ต่อกันตามลำดับ", async () => {
    const { request: req } = streamRequest([Uint8Array.from([1, 2]), Uint8Array.from([3]), Uint8Array.from([4, 5])]);
    expect(Array.from(await readBodyWithLimit(req, 10, tooLarge))).toEqual([1, 2, 3, 4, 5]);
  });

  test("ขนาดพอดี limit → ผ่าน", async () => {
    const { request: req } = streamRequest([bytes(6), bytes(4)], { "content-length": "10" });
    expect((await readBodyWithLimit(req, 10, tooLarge)).byteLength).toBe(10);
  });

  test("ไม่มี Content-Length แต่ส่งจริงเกิน limit → โยน error และ cancel stream", async () => {
    const { request: req, cancel } = streamRequest([bytes(6), bytes(6), bytes(6)]);
    await expect(readBodyWithLimit(req, 10, tooLarge)).rejects.toBe(tooLarge);
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  test("Content-Length โกหก (บอก 5 แต่ส่งจริง 20) → ยังจับได้ว่าเกิน", async () => {
    const { request: req, cancel } = streamRequest([bytes(20)], { "content-length": "5" });
    await expect(readBodyWithLimit(req, 10, tooLarge)).rejects.toBe(tooLarge);
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// จ. readMultipart
// ---------------------------------------------------------------------------

describe("readMultipart", () => {
  const MAX = 1024 * 1024;
  const post = (form: FormData) => request("/x", { method: "POST", form });

  test("Content-Type ไม่ใช่ multipart → VALIDATION_ERROR", async () => {
    const error = await caught(readMultipart(request("/x", { method: "POST", json: {} }), MAX, "ใหญ่เกิน"));
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.message).toBe("Content-Type ต้องเป็น multipart/form-data");
  });

  test("ใหญ่เกิน maxBytes → FILE_TOO_LARGE พร้อมข้อความที่ส่งเข้าไป", async () => {
    const form = new FormData();
    form.append("file", new File([bytes(2000)], "big.pdf"));
    // แปลง form เป็นไบต์ก่อน (เหมือน request จริงที่มาทางเครือข่าย) — ถ้าส่ง FormData ตรง ๆ
    // undici จะ enqueue ต่อหลังเรา cancel stream แล้วเกิด unhandled error ฝั่ง Node
    const encoded = new Response(form);
    const req = request("/x", {
      method: "POST",
      body: await encoded.arrayBuffer(),
      headers: { "Content-Type": encoded.headers.get("content-type")! },
    });
    const error = await caught(readMultipart(req, 1000, "ไฟล์ต้องไม่เกิน 1 KB"));
    expect(error.code).toBe("FILE_TOO_LARGE");
    expect(error.message).toBe("ไฟล์ต้องไม่เกิน 1 KB");
  });

  test("multipart เสีย (boundary ไม่ตรง) → VALIDATION_ERROR", async () => {
    const req = request("/x", {
      method: "POST",
      body: "ไม่ใช่ multipart",
      headers: { "Content-Type": "multipart/form-data; boundary=abc" },
    });
    const error = await caught(readMultipart(req, MAX, "ใหญ่เกิน"));
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.message).toBe("ข้อมูล multipart ไม่ถูกต้อง");
  });

  test("ข้อความ + ไฟล์ → fields เป็นข้อความ และ file เป็นไฟล์ที่ส่งมา", async () => {
    const form = new FormData();
    form.append("title", "สรุปแคลคูลัส");
    form.append("status", "draft");
    form.append("file", new File(["hello"], "note.pdf", { type: "application/pdf" }));

    const { fields, file } = await readMultipart(post(form), MAX, "ใหญ่เกิน");

    expect(fields).toEqual({ title: "สรุปแคลคูลัส", status: "draft" });
    expect(file?.name).toBe("note.pdf");
    expect(await file?.text()).toBe("hello");
  });

  test("ช่อง file เป็นไฟล์ขนาด 0 → file = null", async () => {
    const form = new FormData();
    form.append("title", "x");
    form.append("file", new File([], "empty.pdf"));
    expect((await readMultipart(post(form), MAX, "ใหญ่เกิน")).file).toBeNull();
  });

  test("ไฟล์ที่อยู่ใน field ชื่ออื่น → ไม่ถูกเก็บทั้งใน file และ fields", async () => {
    const form = new FormData();
    form.append("title", "x");
    form.append("attachment", new File(["data"], "other.pdf"));
    const { fields, file } = await readMultipart(post(form), MAX, "ใหญ่เกิน");
    expect(fields).toEqual({ title: "x" });
    expect(file).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// ฉ. readJsonObject
// ---------------------------------------------------------------------------

describe("readJsonObject", () => {
  const LIMIT = 64 * 1024;
  const jsonRequest = (body: string) =>
    request("/x", { method: "POST", body, headers: { "Content-Type": "application/json" } });
  /** JSON {"a":"xxx…"} ที่มีขนาดรวมพอดี size ไบต์ ({"a":""} = 8 ไบต์) */
  const jsonOfSize = (size: number) => `{"a":"${"x".repeat(size - 8)}"}`;

  test("Content-Type ไม่ใช่ JSON → VALIDATION_ERROR", async () => {
    const req = request("/x", { method: "POST", body: "{}", headers: { "Content-Type": "text/plain" } });
    const error = await caught(readJsonObject(req));
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.message).toBe("Content-Type ต้องเป็น application/json");
  });

  test("เกิน 64 KB → VALIDATION_ERROR 'ข้อมูลใหญ่เกินไป'", async () => {
    const error = await caught(readJsonObject(jsonRequest(jsonOfSize(LIMIT + 1))));
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.message).toBe("ข้อมูลใหญ่เกินไป");
  });

  test("ขนาดพอดี 64 KB (65,536 ไบต์) → อ่านได้", async () => {
    const body = jsonOfSize(LIMIT);
    expect(new TextEncoder().encode(body).byteLength).toBe(LIMIT);
    expect((await readJsonObject(jsonRequest(body))).a).toHaveLength(LIMIT - 8);
  });

  test("JSON เสีย → VALIDATION_ERROR 'JSON ไม่ถูกต้อง'", async () => {
    const error = await caught(readJsonObject(jsonRequest("{title:")));
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.message).toBe("JSON ไม่ถูกต้อง");
  });

  test.each([
    ["array", "[1,2]"],
    ["null", "null"],
    ["ตัวเลข", "42"],
  ])("body เป็น %s → VALIDATION_ERROR 'body ต้องเป็น JSON object'", async (_label, body) => {
    const error = await caught(readJsonObject(jsonRequest(body)));
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.message).toBe("body ต้องเป็น JSON object");
  });

  test("JSON object ปกติ → คืน object", async () => {
    expect(await readJsonObject(request("/x", { method: "POST", json: { title: "ใหม่", n: 1 } }))).toEqual({
      title: "ใหม่",
      n: 1,
    });
  });
});
