// src/app/api/v1/[[...path]]/route.ts — ส่วนกลาง + error (รับต่อจาก BE02)
// ก. dispatch: route ที่ไม่มี / method ไม่รองรับ → 404 Route not found
// ข. jsonBody: body ไม่ใช่ object หรืออ่านไม่ได้ → null → 400
// ค. run: error ใด ๆ → 500 "Internal server error." ไม่หลุดรายละเอียด แต่ log ฝั่ง server
//
// การ mock: vi.spyOn ใช้กับ export ของ ESM ตรง ๆ ไม่ได้ → ใช้ vi.mock แทน
// โดยเก็บ getInteractionSql ตัวจริงไว้ test อื่นในไฟล์จึงยังใช้ DB จริง
// และสลับให้พังเฉพาะ test ที่ตั้ง mocks.failWith ไว้ (ดู tests/README.md หัวข้อ 4)
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { DELETE, GET, POST } from "@/app/api/v1/[[...path]]/route";
import { sheets } from "@/db/schema";
import { signUpUser, type TestUser } from "../helpers/auth";
import { cleanDbBeforeAll, testDb } from "../helpers/db";
import { json, params, request } from "../helpers/request";

const mocks = vi.hoisted(() => ({ failWith: null as Error | null }));

vi.mock("@/lib/interaction-db", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/interaction-db")>();
  return {
    ...real,
    getInteractionSql: vi.fn(async () => {
      if (mocks.failWith) throw mocks.failWith;
      return real.getInteractionSql();
    }),
  };
});

cleanDbBeforeAll();

afterEach(() => {
  mocks.failWith = null;
  vi.restoreAllMocks();
});

const NO_SUCH_UUID = "00000000-0000-4000-8000-000000000000";

type CallOptions = { cookie?: string; json?: unknown; body?: string; headers?: Record<string, string> };
const handlers = { GET, POST, DELETE };

/** เรียก route catch-all ด้วย path เช่น ["collections"] */
function call(method: keyof typeof handlers, path: string[], options: CallOptions = {}) {
  return handlers[method](request(`/api/v1/${path.join("/")}`, { method, ...options }), params({ path }));
}

let bob: TestUser;
let published: string;

beforeAll(async () => {
  bob = await signUpUser({ name: "Bob" });
  const [row] = await testDb().insert(sheets).values({ ownerId: bob.id, title: "published", status: "published" }).returning({ id: sheets.id });
  published = row.id;
});

// ---------------------------------------------------------------------------
// ก. route ที่ไม่มี / method ไม่รองรับ
// ---------------------------------------------------------------------------

describe("dispatch — route ที่ไม่มี → 404 Route not found", () => {
  test.each([
    ["path ว่าง (/api/v1)", "GET", () => []],
    ["กลุ่มที่ไม่มี (/nope)", "GET", () => ["nope"]],
    ["path ยาวผิด (/sheets/:id)", "GET", () => ["sheets", published]],
    ["path ยาวเกิน (/sheets/:id/comments/x)", "GET", () => ["sheets", published, "comments", "x"]],
  ] as const)("%s → 404", async (_label, method, path) => {
    const res = await call(method, [...path()], { cookie: bob.cookie });
    expect(res.status).toBe(404);
    expect((await json(res)).error).toEqual({ code: "NOT_FOUND", message: "Route not found." });
  });

  // ล็อกอินแล้วทุกกรณี เพื่อให้ 404 มาจาก "ไม่มี route" จริง ไม่ใช่ถูกตัดที่ 401
  test.each([
    ["DELETE /sheets/:id/comments", "DELETE", () => ["sheets", published, "comments"]],
    ["GET /comments/:id/replies", "GET", () => ["comments", NO_SUCH_UUID, "replies"]],
    ["GET /comments/:id", "GET", () => ["comments", NO_SUCH_UUID]],
    ["GET /sheets/:id/reactions", "GET", () => ["sheets", published, "reactions"]],
    ["GET /sheets/:id/reports", "GET", () => ["sheets", published, "reports"]],
    ["POST /favorites (ไม่มี sheetId)", "POST", () => ["favorites"]],
    ["GET /collections/:id", "GET", () => ["collections", NO_SUCH_UUID]],
    ["POST /users/me/dashboard", "POST", () => ["users", "me", "dashboard"]],
  ] as const)("method ไม่รองรับ: %s → 404 Route not found", async (_label, method, path) => {
    const res = await call(method, [...path()], { cookie: bob.cookie, json: method === "POST" ? {} : undefined });
    expect(res.status).toBe(404);
    expect((await json(res)).error.message).toBe("Route not found.");
  });
});

// ---------------------------------------------------------------------------
// ข. jsonBody
// ---------------------------------------------------------------------------

describe("jsonBody — body ไม่ใช่ object / อ่านไม่ได้ → ถือว่าไม่มีข้อมูล → 400", () => {
  test.each([
    ["JSON string", { json: "hi" }],
    ["JSON number", { json: 42 }],
    ["JSON boolean", { json: true }],
    ["ไม่ส่ง body เลย", {}],
  ])("%s → 400 Collection name is required", async (_label, options) => {
    const res = await call("POST", ["collections"], { cookie: bob.cookie, ...options });
    expect(res.status).toBe(400);
    expect((await json(res)).error.message).toBe("Collection name is required.");
  });
});

// ---------------------------------------------------------------------------
// ค. run — 500
// ---------------------------------------------------------------------------

describe("run — error ใด ๆ → 500 ไม่หลุดรายละเอียด", () => {
  const SECRET = "postgres://admin:hunter2@db.internal:5432/cmlearn";

  test.each([
    ["guest", () => undefined],
    ["ล็อกอินแล้ว", () => bob.cookie],
  ])("DB เชื่อมต่อไม่ได้ (%s) → 500 · body ไม่มีข้อความ error เดิม · log ฝั่ง server", async (_label, cookie) => {
    const error = new Error(`connect ECONNREFUSED ${SECRET}`);
    mocks.failWith = error;
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await call("GET", ["sheets", published, "comments"], { cookie: cookie() });
    expect(res.status).toBe(500);
    const text = await res.text();
    // เดิม bad() แปลง 500 เป็น VALIDATION_ERROR (bug) — แก้ให้ตรงกับ src/lib/api.ts ที่ใช้ INTERNAL_ERROR
    expect(JSON.parse(text)).toEqual({ error: { code: "INTERNAL_ERROR", message: "Internal server error." } });
    expect(text).not.toContain("hunter2");
    expect(text).not.toContain("ECONNREFUSED");
    expect(log).toHaveBeenCalledWith("Interaction API request failed", error);
  });

  // บรรทัด 154: insert แฟ้มพังด้วยเหตุอื่นที่ไม่ใช่ชื่อซ้ำ (23505) → throw ต่อ → run จับเป็น 500
  // ใช้ DB จริง: Postgres ไม่รับตัวอักษร NUL ใน text (error 22021)
  test("สร้างแฟ้มด้วยชื่อที่มี NUL → DB error ที่ไม่ใช่ชื่อซ้ำ → 500 ไม่ใช่ 409", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await call("POST", ["collections"], { cookie: bob.cookie, json: { name: "a\u0000b" } });
    expect(res.status).toBe(500);
    expect((await json(res)).error).toEqual({ code: "INTERNAL_ERROR", message: "Internal server error." });
    expect(log).toHaveBeenCalledOnce();
    expect((log.mock.calls[0][1] as { code?: string }).code).toBe("22021");
  });

  test("หลัง DB กลับมาปกติ request ถัดไปทำงานได้ (mock ไม่ค้าง)", async () => {
    const res = await call("GET", ["collections"], { cookie: bob.cookie });
    expect(res.status).toBe(200);
  });
});
