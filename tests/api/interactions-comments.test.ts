// src/app/api/v1/[[...path]]/route.ts — ส่วนความคิดเห็น (รับต่อจาก BE02)
// ก. GET  /sheets/:id/comments      ดูความคิดเห็นเป็นต้นไม้ (root → replies)
// ข. POST /sheets/:id/comments      เขียนความคิดเห็น
// ค. POST /comments/:id/replies     ตอบ (ตอบได้เฉพาะ root ที่ยังไม่ถูกลบ)
// ง. DELETE /comments/:id           soft delete · เฉพาะผู้เขียน
//
// ชีทและความคิดเห็นสร้างด้วย insert ตรง ๆ เพื่อคุม status / deleted_at / created_at ได้แน่นอน
// กรณี 404 ที่ต้องการทดสอบเงื่อนไขหลังการล็อกอิน ใช้ผู้ใช้ที่ล็อกอินแล้วเสมอ
// เพื่อให้ 404 มาจากเงื่อนไขนั้นจริง ไม่ใช่ถูกตัดตั้งแต่ด่าน 401
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, test } from "vitest";
import { DELETE, GET, POST } from "@/app/api/v1/[[...path]]/route";
import { comments, sheets } from "@/db/schema";
import { signUpUser, type TestUser } from "../helpers/auth";
import { cleanDbBeforeAll, testDb } from "../helpers/db";
import { json, params, request } from "../helpers/request";

cleanDbBeforeAll();

const NO_SUCH_UUID = "00000000-0000-4000-8000-000000000000";
const MAX = 5000;

type CallOptions = { cookie?: string; json?: unknown; body?: string; headers?: Record<string, string> };
const handlers = { GET, POST, DELETE };

/** เรียก route catch-all ด้วย path เช่น ["sheets", id, "comments"] */
function call(method: keyof typeof handlers, path: string[], options: CallOptions = {}) {
  return handlers[method](request(`/api/v1/${path.join("/")}`, { method, ...options }), params({ path }));
}

let alice: TestUser; // เจ้าของชีท
let bob: TestUser;
let carol: TestUser;
let published: string; // ชีท published ของ alice
let aliceDraft: string; // ชีท draft ของ alice
let deletedSheet: string; // ชีท published ของ alice ที่ถูกลบแล้ว

async function insertSheet(values: Partial<typeof sheets.$inferInsert> & { ownerId: string }) {
  const [row] = await testDb()
    .insert(sheets)
    .values({ title: "ชีททดสอบ", status: "published", ...values })
    .returning({ id: sheets.id });
  return row.id;
}

async function insertComment(values: typeof comments.$inferInsert) {
  const [row] = await testDb().insert(comments).values(values).returning({ id: comments.id });
  return row.id;
}

const commentRow = async (id: string) => (await testDb().select().from(comments).where(eq(comments.id, id)))[0];

beforeAll(async () => {
  [alice, bob, carol] = await Promise.all([
    signUpUser({ name: "Alice" }),
    signUpUser({ name: "Bob" }),
    signUpUser({ name: "Carol" }),
  ]);
  published = await insertSheet({ ownerId: alice.id, title: "published" });
  aliceDraft = await insertSheet({ ownerId: alice.id, title: "draft", status: "draft" });
  deletedSheet = await insertSheet({ ownerId: alice.id, title: "deleted", deletedAt: new Date() });
});

// ---------------------------------------------------------------------------
// ก. GET /sheets/:id/comments
// ---------------------------------------------------------------------------

describe("GET /sheets/:id/comments — หาชีทไม่เจอ / มองไม่เห็น", () => {
  test("id ไม่ใช่ uuid → 404", async () => {
    const res = await call("GET", ["sheets", "not-a-uuid", "comments"]);
    expect(res.status).toBe(404);
    expect((await json(res)).error.code).toBe("NOT_FOUND");
  });

  test("uuid ที่ไม่มีชีทนี้ → 404", async () => {
    const res = await call("GET", ["sheets", NO_SUCH_UUID, "comments"]);
    expect(res.status).toBe(404);
  });

  test("ชีทถูกลบ (deleted_at) → 404 แม้เป็นเจ้าของ", async () => {
    const res = await call("GET", ["sheets", deletedSheet, "comments"], { cookie: alice.cookie });
    expect(res.status).toBe(404);
  });

  test.each([
    ["guest", () => undefined],
    ["ผู้ใช้อื่น (bob)", () => bob.cookie],
  ])("ชีทร่างของคนอื่น — %s → 404", async (_label, cookie) => {
    const res = await call("GET", ["sheets", aliceDraft, "comments"], { cookie: cookie() });
    expect(res.status).toBe(404);
  });

  test("ชีทร่างของตัวเอง → 200", async () => {
    const res = await call("GET", ["sheets", aliceDraft, "comments"], { cookie: alice.cookie });
    expect(res.status).toBe(200);
  });
});

describe("GET /sheets/:id/comments — รายการ", () => {
  test("guest ดูชีท published ที่ยังไม่มีความคิดเห็น → 200 และ []", async () => {
    const empty = await insertSheet({ ownerId: alice.id, title: "empty" });
    const res = await call("GET", ["sheets", empty, "comments"]);
    expect(res.status).toBe(200);
    expect((await json(res)).data).toEqual([]);
  });

  // ชุดข้อมูล (created_at ห่างกันทีละ 1 นาที เพื่อให้ลำดับแน่นอน):
  //   T+1 root1  (bob)
  //   T+2 root2  (carol)  ← ถูกลบภายหลัง
  //   T+3 reply1a (carol → root1)
  //   T+4 reply2a (alice → root2)
  //   T+5 reply1b (alice → root1)
  // insert สลับลำดับ (reply1b ก่อน reply1a) เพื่อพิสูจน์ว่าเรียงตาม created_at ไม่ใช่ลำดับที่ insert
  describe("ต้นไม้ความคิดเห็น", () => {
    let thread: string;
    const ids = {} as Record<"root1" | "root2" | "reply1a" | "reply2a" | "reply1b", string>;
    const at = (minutes: number) => new Date(Date.UTC(2026, 0, 1, 0, minutes));
    type Item = { id: string; body: string; deleted: boolean; parentCommentId: string | null; authorName: string; replies: Item[] };
    let roots: Item[];

    beforeAll(async () => {
      thread = await insertSheet({ ownerId: alice.id, title: "thread" });
      ids.root2 = await insertComment({ sheetId: thread, authorId: carol.id, body: "root2", createdAt: at(2) });
      ids.root1 = await insertComment({ sheetId: thread, authorId: bob.id, body: "root1", createdAt: at(1) });
      ids.reply1b = await insertComment({ sheetId: thread, authorId: alice.id, body: "reply1b", parentCommentId: ids.root1, createdAt: at(5) });
      ids.reply2a = await insertComment({ sheetId: thread, authorId: alice.id, body: "reply2a", parentCommentId: ids.root2, createdAt: at(4) });
      ids.reply1a = await insertComment({ sheetId: thread, authorId: carol.id, body: "reply1a", parentCommentId: ids.root1, createdAt: at(3) });
      await testDb().update(comments).set({ deletedAt: new Date() }).where(eq(comments.id, ids.root2));

      const res = await call("GET", ["sheets", thread, "comments"]);
      expect(res.status).toBe(200);
      roots = (await json<{ data: Item[] }>(res)).data;
    });

    test("ระดับบนสุดมีแค่ root เรียงตาม created_at (root1, root2) — reply ไม่หลุดมาระดับบน", () => {
      expect(roots.map((r) => r.id)).toEqual([ids.root1, ids.root2]);
      expect(roots.every((r) => r.parentCommentId === null)).toBe(true);
    });

    test("reply อยู่ใน replies ของ root ตัวเอง เรียงตาม created_at", () => {
      expect(roots[0].replies.map((r) => r.id)).toEqual([ids.reply1a, ids.reply1b]);
      expect(roots[0].replies.every((r) => r.parentCommentId === ids.root1)).toBe(true);
      expect(roots[0].replies[0]).toMatchObject({ body: "reply1a", authorName: "Carol", deleted: false });
    });

    test("root ที่ถูกลบยังแสดง แต่ body เป็น '' และ deleted = true (ไม่หลุดเนื้อหาเดิม)", () => {
      expect(roots[1]).toMatchObject({ id: ids.root2, body: "", deleted: true });
      expect(JSON.stringify(roots)).not.toContain('"root2"');
    });

    test("reply ใต้ root ที่ถูกลบยังอยู่ในบทสนทนา", () => {
      expect(roots[1].replies.map((r) => r.id)).toEqual([ids.reply2a]);
      expect(roots[1].replies[0]).toMatchObject({ body: "reply2a", deleted: false });
    });
  });
});

// ---------------------------------------------------------------------------
// ข. POST /sheets/:id/comments
// ---------------------------------------------------------------------------

describe("POST /sheets/:id/comments — สิทธิ์และชีท", () => {
  test("ไม่ล็อกอิน → 401", async () => {
    const res = await call("POST", ["sheets", published, "comments"], { json: { body: "hi" } });
    expect(res.status).toBe(401);
    expect((await json(res)).error.code).toBe("UNAUTHORIZED");
  });

  test.each([
    ["id ไม่ใช่ uuid", () => "not-a-uuid"],
    ["uuid ที่ไม่มีชีทนี้", () => NO_SUCH_UUID],
    ["ชีทถูกลบ", () => deletedSheet],
    ["ชีทร่างของคนอื่น", () => aliceDraft],
  ])("ล็อกอินแล้ว (bob) แต่ %s → 404 และไม่มีความคิดเห็นถูกสร้าง", async (_label, sheetId) => {
    const before = await testDb().select().from(comments);
    const res = await call("POST", ["sheets", sheetId(), "comments"], { cookie: bob.cookie, json: { body: "hi" } });
    expect(res.status).toBe(404);
    expect(await testDb().select().from(comments)).toHaveLength(before.length);
  });

  test("เจ้าของเขียนความคิดเห็นบนชีทร่างของตัวเองได้ → 201", async () => {
    const res = await call("POST", ["sheets", aliceDraft, "comments"], { cookie: alice.cookie, json: { body: "note" } });
    expect(res.status).toBe(201);
  });
});

describe("POST /sheets/:id/comments — body", () => {
  test.each([
    ["ไม่ส่ง body", {}],
    ["สตริงว่าง", { body: "" }],
    ["มีแต่ช่องว่าง", { body: "  \n\t " }],
    ["ไม่ใช่ string (ตัวเลข)", { body: 123 }],
    ["null", { body: null }],
  ])("%s → 400 Comment body is required", async (_label, payload) => {
    const res = await call("POST", ["sheets", published, "comments"], { cookie: bob.cookie, json: payload });
    expect(res.status).toBe(400);
    expect((await json(res)).error).toEqual({ code: "VALIDATION_ERROR", message: "Comment body is required." });
  });

  test.each([
    ["JSON พัง", { body: "{not json", headers: { "Content-Type": "application/json" } }],
    ["ส่ง array", { json: ["hi"] }],
    ["ส่ง JSON null", { json: null }],
  ])("%s → 400", async (_label, options) => {
    const res = await call("POST", ["sheets", published, "comments"], { cookie: bob.cookie, ...options });
    expect(res.status).toBe(400);
    expect((await json(res)).error.code).toBe("VALIDATION_ERROR");
  });

  // ใช้ ASCII เพราะโค้ดวัดด้วย .length (UTF-16) — ตัวอักษร 1 ตัว = 1 หน่วยแน่นอน
  test(`ยาว ${MAX + 1} ตัว → 400`, async () => {
    const res = await call("POST", ["sheets", published, "comments"], { cookie: bob.cookie, json: { body: "a".repeat(MAX + 1) } });
    expect(res.status).toBe(400);
    expect((await json(res)).error.message).toContain("5,000");
  });

  test(`ยาวพอดี ${MAX} ตัว → 201`, async () => {
    const res = await call("POST", ["sheets", published, "comments"], { cookie: bob.cookie, json: { body: "a".repeat(MAX) } });
    expect(res.status).toBe(201);
  });

  test(`ยาวเกิน ${MAX} เพราะช่องว่างหน้า-หลัง → 201 (วัดหลัง trim)`, async () => {
    const res = await call("POST", ["sheets", published, "comments"], { cookie: bob.cookie, json: { body: `  ${"a".repeat(MAX)}  ` } });
    expect(res.status).toBe(201);
  });

  test("สำเร็จ → 201 · trim แล้ว · เป็น root · บันทึกลง DB", async () => {
    const res = await call("POST", ["sheets", published, "comments"], { cookie: bob.cookie, json: { body: "  สรุปดีมาก  " } });
    expect(res.status).toBe(201);
    const { data } = await json(res);
    expect(data).toMatchObject({ sheetId: published, authorId: bob.id, body: "สรุปดีมาก", parentCommentId: null });

    const row = await commentRow(data.id);
    expect(row).toMatchObject({ sheetId: published, authorId: bob.id, body: "สรุปดีมาก", parentCommentId: null, deletedAt: null });
  });
});

// ---------------------------------------------------------------------------
// ค. POST /comments/:id/replies
// ---------------------------------------------------------------------------

describe("POST /comments/:id/replies", () => {
  let root: string;

  beforeAll(async () => {
    root = await insertComment({ sheetId: published, authorId: bob.id, body: "root" });
  });

  test("ไม่ล็อกอิน → 401", async () => {
    const res = await call("POST", ["comments", root, "replies"], { json: { body: "hi" } });
    expect(res.status).toBe(401);
  });

  test("ล็อกอินแล้ว แต่ id ไม่ใช่ uuid → 404 Comment not found", async () => {
    const res = await call("POST", ["comments", "not-a-uuid", "replies"], { cookie: carol.cookie, json: { body: "hi" } });
    expect(res.status).toBe(404);
    expect((await json(res)).error.message).toBe("Comment not found.");
  });

  test("ล็อกอินแล้ว + body ถูกต้อง แต่ uuid ไม่มีความคิดเห็นนี้ → 404", async () => {
    const res = await call("POST", ["comments", NO_SUCH_UUID, "replies"], { cookie: carol.cookie, json: { body: "hi" } });
    expect(res.status).toBe(404);
    expect((await json(res)).error.message).toBe("A reply can only target an active top-level comment.");
  });

  test.each([
    ["สตริงว่าง", { body: "" }],
    ["มีแต่ช่องว่าง", { body: "   " }],
    ["ไม่ส่ง body", {}],
  ])("body ไม่มีค่า (%s) → 400 Reply body is required", async (_label, payload) => {
    const res = await call("POST", ["comments", root, "replies"], { cookie: carol.cookie, json: payload });
    expect(res.status).toBe(400);
    expect((await json(res)).error.message).toBe("Reply body is required.");
  });

  test(`ยาว ${MAX + 1} ตัว → 400 · ยาวพอดี ${MAX} ตัว → 201`, async () => {
    const tooLong = await call("POST", ["comments", root, "replies"], { cookie: carol.cookie, json: { body: "a".repeat(MAX + 1) } });
    expect(tooLong.status).toBe(400);
    const exact = await call("POST", ["comments", root, "replies"], { cookie: carol.cookie, json: { body: "a".repeat(MAX) } });
    expect(exact.status).toBe(201);
  });

  // พฤติกรรมปัจจุบัน: ตรวจ body ก่อนหา parent → body ว่างไปยังความคิดเห็นที่ไม่มีอยู่ได้ 400 ไม่ใช่ 404
  // ไม่อันตราย (ไม่บอกข้อมูลอะไร) แต่บันทึกไว้ในรายงาน
  test("body ว่าง + uuid ที่ไม่มีอยู่ → 400 (ตรวจ body ก่อน parent)", async () => {
    const res = await call("POST", ["comments", NO_SUCH_UUID, "replies"], { cookie: carol.cookie, json: { body: "" } });
    expect(res.status).toBe(400);
  });

  test("ตอบความคิดเห็นที่ถูกลบแล้ว → 404", async () => {
    const gone = await insertComment({ sheetId: published, authorId: bob.id, body: "gone", deletedAt: new Date() });
    const res = await call("POST", ["comments", gone, "replies"], { cookie: carol.cookie, json: { body: "hi" } });
    expect(res.status).toBe(404);
    expect((await testDb().select().from(comments).where(eq(comments.parentCommentId, gone)))).toHaveLength(0);
  });

  test("ตอบ reply (ซ้อนชั้นที่ 2) → 404", async () => {
    const reply = await insertComment({ sheetId: published, authorId: carol.id, body: "reply", parentCommentId: root });
    const res = await call("POST", ["comments", reply, "replies"], { cookie: bob.cookie, json: { body: "hi" } });
    expect(res.status).toBe(404);
    expect((await json(res)).error.message).toBe("A reply can only target an active top-level comment.");
  });

  test("root อยู่บนชีทที่ผู้ตอบมองไม่เห็นแล้ว (ชีทถูกลบ) → 404 Sheet not found", async () => {
    const sheet = await insertSheet({ ownerId: alice.id, title: "will be deleted" });
    const orphanRoot = await insertComment({ sheetId: sheet, authorId: bob.id, body: "root" });
    await testDb().update(sheets).set({ deletedAt: new Date() }).where(eq(sheets.id, sheet));

    const res = await call("POST", ["comments", orphanRoot, "replies"], { cookie: carol.cookie, json: { body: "hi" } });
    expect(res.status).toBe(404);
    expect((await json(res)).error.message).toBe("Sheet not found.");
  });

  test("root อยู่บนชีทร่างของคนอื่น → 404 Sheet not found", async () => {
    const draftRoot = await insertComment({ sheetId: aliceDraft, authorId: alice.id, body: "note" });
    const res = await call("POST", ["comments", draftRoot, "replies"], { cookie: carol.cookie, json: { body: "hi" } });
    expect(res.status).toBe(404);
    expect((await json(res)).error.message).toBe("Sheet not found.");
  });

  test("สำเร็จ → 201 · sheetId มาจาก parent · parentCommentId ถูก · trim แล้ว", async () => {
    const res = await call("POST", ["comments", root, "replies"], { cookie: carol.cookie, json: { body: "  ขอบคุณ  " } });
    expect(res.status).toBe(201);
    const { data } = await json(res);
    expect(data).toMatchObject({ sheetId: published, authorId: carol.id, parentCommentId: root, body: "ขอบคุณ" });
    expect(await commentRow(data.id)).toMatchObject({ sheetId: published, parentCommentId: root });
  });
});

// ---------------------------------------------------------------------------
// ง. DELETE /comments/:id
// ---------------------------------------------------------------------------

describe("DELETE /comments/:id", () => {
  let target: string;

  beforeAll(async () => {
    target = await insertComment({ sheetId: published, authorId: bob.id, body: "ของ bob" });
  });

  test("guest → 401 (ตรวจการล็อกอินก่อน uuid)", async () => {
    const res = await call("DELETE", ["comments", target]);
    expect(res.status).toBe(401);
  });

  test("guest + id ไม่ใช่ uuid → ยังได้ 401 ไม่ใช่ 404", async () => {
    const res = await call("DELETE", ["comments", "not-a-uuid"]);
    expect(res.status).toBe(401);
  });

  test("ล็อกอินแล้ว + id ไม่ใช่ uuid → 404", async () => {
    const res = await call("DELETE", ["comments", "not-a-uuid"], { cookie: bob.cookie });
    expect(res.status).toBe(404);
    expect((await json(res)).error.message).toBe("Comment not found.");
  });

  test("ล็อกอินแล้ว + uuid ที่ไม่มีอยู่ → 404", async () => {
    const res = await call("DELETE", ["comments", NO_SUCH_UUID], { cookie: bob.cookie });
    expect(res.status).toBe(404);
  });

  test.each([
    ["ผู้ใช้อื่น (carol)", () => carol.cookie],
    ["เจ้าของชีท (alice) แต่ไม่ใช่ผู้เขียน", () => alice.cookie],
  ])("%s ลบ → 404 และความคิดเห็นยังไม่ถูกลบ", async (_label, cookie) => {
    const res = await call("DELETE", ["comments", target], { cookie: cookie() });
    expect(res.status).toBe(404);
    expect((await commentRow(target)).deletedAt).toBeNull();
  });

  test("ผู้เขียนลบ → 200 { deleted: true } · deleted_at มีค่า · แถวยังอยู่ (soft delete)", async () => {
    const res = await call("DELETE", ["comments", target], { cookie: bob.cookie });
    expect(res.status).toBe(200);
    expect((await json(res)).data).toEqual({ deleted: true });

    const row = await commentRow(target);
    expect(row).toBeDefined();
    expect(row.deletedAt).toBeInstanceOf(Date);
    expect(row.body).toBe("ของ bob");
  });

  test("ลบซ้ำ → 404", async () => {
    const res = await call("DELETE", ["comments", target], { cookie: bob.cookie });
    expect(res.status).toBe(404);
  });
});
