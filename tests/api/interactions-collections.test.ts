// src/app/api/v1/[[...path]]/route.ts — ส่วน Collections (รับต่อจาก BE02)
// ก. ด่านแรกที่ใช้ร่วมทุก endpoint (401 / id ไม่ใช่ uuid)
// ข. GET    /collections                       แฟ้มของตัวเอง + sheetCount
// ค. POST   /collections                       สร้างแฟ้ม
// ง. POST   /collections/:id/sheets            ใส่ชีทลงแฟ้ม
// จ. GET    /collections/:id/sheets            ดูชีทในแฟ้ม (public / private)
// ฉ. DELETE /collections/:id/sheets/:sheetId   เอาชีทออกจากแฟ้ม
//
// แฟ้ม/ชีท/รายการในแฟ้มที่ต้องคุมเวลา (created_at / added_at) สร้างด้วย insert ตรง ๆ
// กรณี 404 หลังการล็อกอินใช้ผู้ใช้ที่ล็อกอินแล้วเสมอ เพื่อให้ 404 มาจากเงื่อนไขนั้นจริง
import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, test } from "vitest";
import { DELETE, GET, POST } from "@/app/api/v1/[[...path]]/route";
import { collectionItems, collections, sheets } from "@/db/schema";
import { signUpUser, type TestUser } from "../helpers/auth";
import { cleanDbBeforeAll, testDb } from "../helpers/db";
import { json, params, request } from "../helpers/request";

cleanDbBeforeAll();

const NO_SUCH_UUID = "00000000-0000-4000-8000-000000000000";

type CallOptions = { cookie?: string; json?: unknown; body?: string; headers?: Record<string, string> };
const handlers = { GET, POST, DELETE };

/** เรียก route catch-all ด้วย path เช่น ["collections", id, "sheets"] */
function call(method: keyof typeof handlers, path: string[], options: CallOptions = {}) {
  return handlers[method](request(`/api/v1/${path.join("/")}`, { method, ...options }), params({ path }));
}

let alice: TestUser; // เจ้าของชีทส่วนใหญ่
let bob: TestUser;
let carol: TestUser;
let published: string; // ชีท published ของ alice
let published2: string; // ชีท published อีกใบของ alice
let aliceDraft: string; // ชีทร่างของ alice
let deletedSheet: string; // ชีท published ของ alice ที่ถูกลบแล้ว

async function insertSheet(values: Partial<typeof sheets.$inferInsert> & { ownerId: string }) {
  const [row] = await testDb()
    .insert(sheets)
    .values({ title: "ชีททดสอบ", status: "published", ...values })
    .returning({ id: sheets.id });
  return row.id;
}

async function insertCollection(values: Partial<typeof collections.$inferInsert> & { ownerId: string; name: string }) {
  const [row] = await testDb().insert(collections).values(values).returning({ id: collections.id });
  return row.id;
}

async function insertItem(collectionId: string, sheetId: string, addedAt?: Date) {
  await testDb().insert(collectionItems).values({ collectionId, sheetId, ...(addedAt ? { addedAt } : {}) });
}

const itemsOf = (collectionId: string) =>
  testDb().select().from(collectionItems).where(eq(collectionItems.collectionId, collectionId));

const at = (minutes: number) => new Date(Date.UTC(2026, 0, 1, 0, minutes));

beforeAll(async () => {
  [alice, bob, carol] = await Promise.all([
    signUpUser({ name: "Alice" }),
    signUpUser({ name: "Bob" }),
    signUpUser({ name: "Carol" }),
  ]);
  published = await insertSheet({ ownerId: alice.id, title: "published" });
  published2 = await insertSheet({ ownerId: alice.id, title: "published 2" });
  aliceDraft = await insertSheet({ ownerId: alice.id, title: "draft", status: "draft" });
  deletedSheet = await insertSheet({ ownerId: alice.id, title: "deleted", deletedAt: new Date() });
});

// ---------------------------------------------------------------------------
// ก. ด่านแรก
// ---------------------------------------------------------------------------

describe("Collections — ด่านแรก (ล็อกอิน / id)", () => {
  test.each([
    ["GET /collections", "GET", () => ["collections"]],
    ["POST /collections", "POST", () => ["collections"]],
    ["POST /collections/:id/sheets", "POST", () => ["collections", NO_SUCH_UUID, "sheets"]],
    ["GET /collections/:id/sheets", "GET", () => ["collections", NO_SUCH_UUID, "sheets"]],
    ["DELETE /collections/:id/sheets/:sheetId", "DELETE", () => ["collections", NO_SUCH_UUID, "sheets", published]],
  ] as const)("guest เรียก %s → 401", async (_label, method, path) => {
    const res = await call(method, [...path()], { json: method === "POST" ? { name: "x", sheetId: published } : undefined });
    expect(res.status).toBe(401);
    expect((await json(res)).error.code).toBe("UNAUTHORIZED");
  });

  test("guest + id แฟ้มไม่ใช่ uuid → ยังได้ 401 (ตรวจการล็อกอินก่อน)", async () => {
    const res = await call("GET", ["collections", "not-a-uuid", "sheets"]);
    expect(res.status).toBe(401);
  });

  test.each([
    ["GET", ["collections", "not-a-uuid", "sheets"]],
    ["POST", ["collections", "not-a-uuid", "sheets"]],
    ["DELETE", ["collections", "not-a-uuid", "sheets", NO_SUCH_UUID]],
  ] as const)("ล็อกอินแล้ว + id แฟ้มไม่ใช่ uuid (%s) → 404 Collection not found", async (method, path) => {
    const res = await call(method, [...path], { cookie: bob.cookie, json: method === "POST" ? { sheetId: published } : undefined });
    expect(res.status).toBe(404);
    expect((await json(res)).error.message).toBe("Collection not found.");
  });

  test("ล็อกอินแล้ว + sheetId ใน path ไม่ใช่ uuid → 404 Sheet not found", async () => {
    const res = await call("DELETE", ["collections", NO_SUCH_UUID, "sheets", "not-a-uuid"], { cookie: bob.cookie });
    expect(res.status).toBe(404);
    expect((await json(res)).error.message).toBe("Sheet not found.");
  });
});

// ---------------------------------------------------------------------------
// ข. GET /collections
// ---------------------------------------------------------------------------

describe("GET /collections", () => {
  let dana: TestUser; // ผู้ใช้ใหม่ที่ไม่มี test อื่นมาสร้างแฟ้มให้
  let older: string;
  let newer: string;

  beforeAll(async () => {
    dana = await signUpUser({ name: "Dana" });
  });

  test("ยังไม่มีแฟ้ม → 200 และ []", async () => {
    const res = await call("GET", ["collections"], { cookie: dana.cookie });
    expect(res.status).toBe(200);
    expect((await json(res)).data).toEqual([]);
  });

  test("เห็นเฉพาะแฟ้มของตัวเอง เรียงใหม่ → เก่า · sheetCount นับถูก (แฟ้มว่าง = 0)", async () => {
    older = await insertCollection({ ownerId: dana.id, name: "เก่า", createdAt: at(1) });
    newer = await insertCollection({ ownerId: dana.id, name: "ใหม่", isPublic: true, createdAt: at(2) });
    await insertCollection({ ownerId: carol.id, name: "ของ carol" });
    await insertItem(older, published);
    await insertItem(older, published2);

    const res = await call("GET", ["collections"], { cookie: dana.cookie });
    expect(res.status).toBe(200);
    const { data } = await json(res);
    expect(data.map((c: { id: string }) => c.id)).toEqual([newer, older]);
    expect(data[0]).toMatchObject({ name: "ใหม่", isPublic: true, sheetCount: 0, description: null });
    expect(data[1]).toMatchObject({ name: "เก่า", isPublic: false, sheetCount: 2 });
  });
});

// ---------------------------------------------------------------------------
// ค. POST /collections
// ---------------------------------------------------------------------------

describe("POST /collections — ตรวจข้อมูล", () => {
  test.each([
    ["ไม่ส่ง name", {}],
    ["สตริงว่าง", { name: "" }],
    ["มีแต่ช่องว่าง", { name: "   " }],
    ["ไม่ใช่ string (ตัวเลข)", { name: 123 }],
  ])("%s → 400 Collection name is required", async (_label, payload) => {
    const res = await call("POST", ["collections"], { cookie: bob.cookie, json: payload });
    expect(res.status).toBe(400);
    expect((await json(res)).error).toEqual({ code: "VALIDATION_ERROR", message: "Collection name is required." });
  });

  test.each([
    ["JSON พัง", { body: "{not json", headers: { "Content-Type": "application/json" } }],
    ["ส่ง array", { json: ["x"] }],
  ])("%s → 400 (อ่าน name ไม่ได้)", async (_label, options) => {
    const res = await call("POST", ["collections"], { cookie: bob.cookie, ...options });
    expect(res.status).toBe(400);
    expect((await json(res)).error.code).toBe("VALIDATION_ERROR");
  });

  test.each([
    ["name ยาว 121 ตัว", { name: "a".repeat(121) }],
    ["description ยาว 1001 ตัว", { name: "ok", description: "a".repeat(1001) }],
  ])("%s → 400 too long", async (_label, payload) => {
    const res = await call("POST", ["collections"], { cookie: bob.cookie, json: payload });
    expect(res.status).toBe(400);
    expect((await json(res)).error.message).toBe("Collection name or description is too long.");
  });

  test("name ยาวพอดี 120 ตัว + description ยาวพอดี 1000 ตัว → 201", async () => {
    const res = await call("POST", ["collections"], {
      cookie: bob.cookie,
      json: { name: "b".repeat(120), description: "d".repeat(1000) },
    });
    expect(res.status).toBe(201);
  });
});

describe("POST /collections — สร้าง", () => {
  test("สำเร็จ → 201 · trim แล้ว · บันทึกลง DB", async () => {
    const res = await call("POST", ["collections"], {
      cookie: bob.cookie,
      json: { name: "  สอบกลางภาค  ", description: "  ชีทเลข  ", isPublic: true },
    });
    expect(res.status).toBe(201);
    const { data } = await json(res);
    expect(data).toMatchObject({ ownerId: bob.id, name: "สอบกลางภาค", description: "ชีทเลข", isPublic: true });

    const [row] = await testDb().select().from(collections).where(eq(collections.id, data.id));
    expect(row).toMatchObject({ ownerId: bob.id, name: "สอบกลางภาค", description: "ชีทเลข", isPublic: true });
  });

  test("description ว่าง/มีแต่ช่องว่าง → บันทึกเป็น null", async () => {
    const res = await call("POST", ["collections"], { cookie: bob.cookie, json: { name: "ไม่มีคำอธิบาย", description: "   " } });
    expect(res.status).toBe(201);
    expect((await json(res)).data.description).toBeNull();
  });

  test.each([
    ["ไม่ส่ง isPublic", {}],
    ["isPublic เป็นสตริง 'true'", { isPublic: "true" }],
    ["isPublic เป็น 1", { isPublic: 1 }],
  ])("%s → isPublic = false (ต้องเป็น true จริง ๆ เท่านั้น)", async (label, extra) => {
    const res = await call("POST", ["collections"], { cookie: bob.cookie, json: { name: `private ${label}`, ...extra } });
    expect(res.status).toBe(201);
    expect((await json(res)).data.isPublic).toBe(false);
  });

  test("ชื่อซ้ำกับแฟ้มของตัวเอง → 409 และไม่มีแฟ้มเพิ่ม", async () => {
    const first = await call("POST", ["collections"], { cookie: carol.cookie, json: { name: "ซ้ำ" } });
    expect(first.status).toBe(201);

    const res = await call("POST", ["collections"], { cookie: carol.cookie, json: { name: "  ซ้ำ  " } });
    expect(res.status).toBe(409);
    expect((await json(res)).error.code).toBe("CONFLICT");
    const rows = await testDb().select().from(collections).where(and(eq(collections.ownerId, carol.id), eq(collections.name, "ซ้ำ")));
    expect(rows).toHaveLength(1);
  });

  test("ชื่อซ้ำกับแฟ้มของคนอื่น → 201 (ห้ามซ้ำเฉพาะในเจ้าของเดียวกัน)", async () => {
    const res = await call("POST", ["collections"], { cookie: bob.cookie, json: { name: "ซ้ำ" } });
    expect(res.status).toBe(201);
  });
});

// ---------------------------------------------------------------------------
// ง. POST /collections/:id/sheets
// ---------------------------------------------------------------------------

describe("POST /collections/:id/sheets", () => {
  let bobCol: string;

  beforeAll(async () => {
    bobCol = await insertCollection({ ownerId: bob.id, name: "ใส่ชีท" });
  });

  test.each([
    ["ไม่ส่ง sheetId", {}],
    ["sheetId ว่าง", { sheetId: "" }],
    ["sheetId ไม่ใช่ string", { sheetId: 123 }],
  ])("%s → 400 sheetId is required", async (_label, payload) => {
    const res = await call("POST", ["collections", bobCol, "sheets"], { cookie: bob.cookie, json: payload });
    expect(res.status).toBe(400);
    expect((await json(res)).error.message).toBe("sheetId is required.");
  });

  // เดิมได้ 500 เพราะ Postgres แปลง "abc" เป็น uuid ไม่ได้ — แก้แล้วให้ตรวจ isUuid ก่อนเหมือน endpoint อื่น
  test("sheetId ใน body ไม่ใช่ uuid → 404 Sheet not found (ไม่ใช่ 500)", async () => {
    const res = await call("POST", ["collections", bobCol, "sheets"], { cookie: bob.cookie, json: { sheetId: "not-a-uuid" } });
    expect(res.status).toBe(404);
    expect((await json(res)).error.message).toBe("Sheet not found.");
  });

  test.each([
    ["แฟ้มไม่มีอยู่", () => NO_SUCH_UUID],
    ["แฟ้มของคนอื่น (bob)", () => bobCol],
  ])("carol ใส่ชีทลง%s → 404 Collection not found และไม่มีรายการเพิ่ม", async (_label, collectionId) => {
    const res = await call("POST", ["collections", collectionId(), "sheets"], { cookie: carol.cookie, json: { sheetId: published } });
    expect(res.status).toBe(404);
    expect((await json(res)).error.message).toBe("Collection not found.");
    expect(await itemsOf(bobCol)).toHaveLength(0);
  });

  test.each([
    ["ชีทไม่มีอยู่", () => NO_SUCH_UUID],
    ["ชีทถูกลบ", () => deletedSheet],
    ["ชีทร่างของคนอื่น", () => aliceDraft],
  ])("%s → 404 Sheet not found และไม่มีรายการเพิ่ม", async (_label, sheetId) => {
    const res = await call("POST", ["collections", bobCol, "sheets"], { cookie: bob.cookie, json: { sheetId: sheetId() } });
    expect(res.status).toBe(404);
    expect((await json(res)).error.message).toBe("Sheet not found.");
    expect(await itemsOf(bobCol)).toHaveLength(0);
  });

  test("สำเร็จ → 201 และมีแถวใน collection_items", async () => {
    const res = await call("POST", ["collections", bobCol, "sheets"], { cookie: bob.cookie, json: { sheetId: published } });
    expect(res.status).toBe(201);
    expect((await json(res)).data).toEqual({ collectionId: bobCol, sheetId: published, added: true });
    expect((await itemsOf(bobCol)).map((i) => i.sheetId)).toEqual([published]);
  });

  test("เพิ่มชีทเดิมซ้ำ → ยัง 201 ไม่ error และไม่เกิดแถวซ้ำ", async () => {
    const res = await call("POST", ["collections", bobCol, "sheets"], { cookie: bob.cookie, json: { sheetId: published } });
    expect(res.status).toBe(201);
    expect(await itemsOf(bobCol)).toHaveLength(1);
  });

  test("เจ้าของใส่ชีทร่างของตัวเองได้ → 201", async () => {
    const aliceCol = await insertCollection({ ownerId: alice.id, name: "ร่างของฉัน" });
    const res = await call("POST", ["collections", aliceCol, "sheets"], { cookie: alice.cookie, json: { sheetId: aliceDraft } });
    expect(res.status).toBe(201);
  });
});

// ---------------------------------------------------------------------------
// จ. GET /collections/:id/sheets
// ---------------------------------------------------------------------------

describe("GET /collections/:id/sheets", () => {
  let publicCol: string; // แฟ้ม public ของ alice
  let privateCol: string; // แฟ้ม private ของ alice
  let bobDraft: string;

  beforeAll(async () => {
    publicCol = await insertCollection({ ownerId: alice.id, name: "public", isPublic: true });
    privateCol = await insertCollection({ ownerId: alice.id, name: "private" });
    bobDraft = await insertSheet({ ownerId: bob.id, title: "bob draft", status: "draft" });

    // ใส่ชีทสลับเวลา เพื่อพิสูจน์ว่าเรียงตาม added_at ใหม่ → เก่า
    await insertItem(publicCol, published, at(1));
    await insertItem(publicCol, aliceDraft, at(2));
    await insertItem(publicCol, published2, at(3));
    await insertItem(publicCol, deletedSheet, at(4));
    await insertItem(publicCol, bobDraft, at(5)); // ร่างของ bob ที่อยู่ในแฟ้มของ alice
    await insertItem(privateCol, published, at(1));
  });

  const ids = async (res: Response) => (await json(res)).data.map((s: { id: string }) => s.id);

  test("เจ้าของเห็นชีทในแฟ้ม เรียงที่เพิ่มล่าสุดก่อน · เห็นร่างของตัวเอง · ซ่อนชีทที่ถูกลบและร่างของคนอื่น", async () => {
    const res = await call("GET", ["collections", publicCol, "sheets"], { cookie: alice.cookie });
    expect(res.status).toBe(200);
    expect(await ids(res)).toEqual([published2, aliceDraft, published]);
  });

  test("คนอื่นดูแฟ้ม public ได้ แต่ไม่เห็นร่างของเจ้าของแฟ้ม", async () => {
    const res = await call("GET", ["collections", publicCol, "sheets"], { cookie: carol.cookie });
    expect(res.status).toBe(200);
    expect(await ids(res)).toEqual([published2, published]);
  });

  test("bob เห็นร่างของตัวเองที่อยู่ในแฟ้ม public ของ alice", async () => {
    const res = await call("GET", ["collections", publicCol, "sheets"], { cookie: bob.cookie });
    expect(await ids(res)).toEqual([bobDraft, published2, published]);
  });

  test("ข้อมูลแต่ละชีทมี id/title/description/addedAt", async () => {
    const res = await call("GET", ["collections", publicCol, "sheets"], { cookie: carol.cookie });
    expect((await json(res)).data[0]).toEqual({ id: published2, title: "published 2", description: null, addedAt: at(3).toISOString() });
  });

  // พฤติกรรมปัจจุบัน: แฟ้ม private ของคนอื่น / แฟ้มที่ไม่มีอยู่ ได้ 200 [] ไม่ใช่ 404
  // ไม่หลุดข้อมูล (ไม่บอกว่ามีแฟ้มหรือไม่) แต่บันทึกไว้ในรายงาน
  test.each([
    ["แฟ้ม private ของคนอื่น", () => privateCol],
    ["แฟ้มที่ไม่มีอยู่", () => NO_SUCH_UUID],
  ])("%s → 200 และ []", async (_label, collectionId) => {
    const res = await call("GET", ["collections", collectionId(), "sheets"], { cookie: carol.cookie });
    expect(res.status).toBe(200);
    expect((await json(res)).data).toEqual([]);
  });

  test("เจ้าของดูแฟ้ม private ของตัวเองได้", async () => {
    const res = await call("GET", ["collections", privateCol, "sheets"], { cookie: alice.cookie });
    expect(await ids(res)).toEqual([published]);
  });
});

// ---------------------------------------------------------------------------
// ฉ. DELETE /collections/:id/sheets/:sheetId
// ---------------------------------------------------------------------------

describe("DELETE /collections/:id/sheets/:sheetId", () => {
  let col: string;

  beforeAll(async () => {
    col = await insertCollection({ ownerId: alice.id, name: "จะลบ", isPublic: true });
    await insertItem(col, published);
    await insertItem(col, published2);
  });

  test("คนอื่นเอาชีทออกจากแฟ้ม public ของ alice → 404 และแถวยังอยู่", async () => {
    const res = await call("DELETE", ["collections", col, "sheets", published], { cookie: carol.cookie });
    expect(res.status).toBe(404);
    expect((await json(res)).error.message).toBe("Collection item not found.");
    expect(await itemsOf(col)).toHaveLength(2);
  });

  test("ชีทที่ไม่ได้อยู่ในแฟ้ม → 404", async () => {
    const res = await call("DELETE", ["collections", col, "sheets", NO_SUCH_UUID], { cookie: alice.cookie });
    expect(res.status).toBe(404);
  });

  test("เจ้าของเอาออก → 200 { removed: true } · ลบเฉพาะแถวนั้น", async () => {
    const res = await call("DELETE", ["collections", col, "sheets", published], { cookie: alice.cookie });
    expect(res.status).toBe(200);
    expect((await json(res)).data).toEqual({ removed: true });
    expect((await itemsOf(col)).map((i) => i.sheetId)).toEqual([published2]);
    // ชีทเองยังอยู่ ลบแค่ความสัมพันธ์กับแฟ้ม
    expect(await testDb().select().from(sheets).where(eq(sheets.id, published))).toHaveLength(1);
  });

  test("เอาออกซ้ำ → 404", async () => {
    const res = await call("DELETE", ["collections", col, "sheets", published], { cookie: alice.cookie });
    expect(res.status).toBe(404);
  });
});
