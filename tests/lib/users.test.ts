// src/lib/users.ts — Profile API ของ BE01
// ก. รูปโปรไฟล์ (isValidUserId / avatarUrl / avatarKeyFromImage) — ฟังก์ชันล้วน
// ข. getOwnProfile — ใช้ DB จริง (ไม่พบผู้ใช้ / ผู้ใช้ถูกลบ / สถิติ)
// ค. parseProfileInput — ฟังก์ชันล้วน ด่านกันการแก้ role/email
//
// กรณีที่มี input หลายแบบแต่คาดหวังผลเดียวกัน ใช้ test.each → แต่ละค่าเป็นกรณีย่อยแยกกัน
// ถ้าพังจะรู้ทันทีว่าค่าไหนพัง
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, test } from "vitest";
import { sheetReactions, sheets, user } from "@/db/schema";
import { ApiError } from "@/lib/api";
import {
  BIO_MAX,
  NAME_MAX,
  avatarKeyFromImage,
  avatarUrl,
  getOwnProfile,
  isValidUserId,
  parseProfileInput,
} from "@/lib/users";
import { signUpUser, type TestUser } from "../helpers/auth";
import { cleanDbBeforeAll, testDb } from "../helpers/db";

cleanDbBeforeAll();

const UUID = "0f8fad5b-d9cb-469f-a165-70867728950e";
const prefix = (userId: string) => `/api/v1/users/${userId}/avatar?v=`;

/** เรียก fn แล้วคืน ApiError ที่โยนออกมา (ถ้าไม่โยน หรือโยน error ชนิดอื่น → test พัง) */
async function apiErrorOf(fn: () => unknown): Promise<ApiError> {
  try {
    await fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ApiError);
    return e as ApiError;
  }
  throw new Error("คาดว่าจะโยน ApiError แต่ไม่โยน");
}

// ---------------------------------------------------------------------------
// ก. รูปโปรไฟล์
// ---------------------------------------------------------------------------

describe("isValidUserId", () => {
  test.each(["abc", "A-b_9", "x".repeat(64)])("ถูกต้อง: %s", (id) => {
    expect(isValidUserId(id)).toBe(true);
  });

  test.each([
    ["ว่าง", ""],
    ["ยาว 65 ตัว", "x".repeat(65)],
    ["มี /", "a/b"],
    ["มี ..", ".."],
    ["มีช่องว่าง", "a b"],
  ])("ไม่ถูกต้อง: %s", (_label, id) => {
    expect(isValidUserId(id)).toBe(false);
  });
});

describe("avatarUrl", () => {
  test("ใช้เฉพาะชื่อไฟล์ส่วนท้ายของ storage key", () => {
    expect(avatarUrl("u1", `avatars/u1/${UUID}.png`)).toBe(`/api/v1/users/u1/avatar?v=${UUID}.png`);
  });

  test("key ที่ไม่มี / → ใช้ทั้ง key", () => {
    expect(avatarUrl("u1", `${UUID}.webp`)).toBe(`/api/v1/users/u1/avatar?v=${UUID}.webp`);
  });
});

describe("avatarKeyFromImage", () => {
  test.each([
    ["null", null],
    ["undefined", undefined],
    ["สตริงว่าง", ""],
    ["URL ภายนอก (Google)", "https://lh3.googleusercontent.com/a/photo.jpg"],
  ])("ไม่มีรูป / รูปภายนอก → null: %s", (_label, image) => {
    expect(avatarKeyFromImage("u1", image)).toBeNull();
  });

  test.each(["png", "jpg", "webp"])("URL ของ user คนนั้น + ชื่อไฟล์ UUID.%s → storage key", (ext) => {
    expect(avatarKeyFromImage("u1", `${prefix("u1")}${UUID}.${ext}`)).toBe(`avatars/u1/${UUID}.${ext}`);
  });

  test.each([
    ["URL ของผู้ใช้คนอื่น", `${prefix("u2")}${UUID}.png`],
    ["userId เป็น prefix ของอีกคน (u1 vs u10)", `${prefix("u10")}${UUID}.png`],
    ["นามสกุลไม่รองรับ (.gif)", `${prefix("u1")}${UUID}.gif`],
    ["นามสกุล .jpeg (รองรับแค่ .jpg)", `${prefix("u1")}${UUID}.jpeg`],
    ["ชื่อไฟล์ไม่ใช่ UUID", `${prefix("u1")}photo.png`],
    ["UUID ตัวพิมพ์ใหญ่", `${prefix("u1")}${UUID.toUpperCase()}.png`],
    ["path traversal (../)", `${prefix("u1")}../u2/${UUID}.png`],
    ["มีส่วนเกินท้ายไฟล์", `${prefix("u1")}${UUID}.png&x=1`],
    ["ไม่มีชื่อไฟล์", prefix("u1")],
  ])("ไม่ใช่ไฟล์รูปของ user คนนี้ → null: %s", (_label, image) => {
    expect(avatarKeyFromImage("u1", image)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// ข. getOwnProfile
// ---------------------------------------------------------------------------

describe("getOwnProfile — ไม่พบผู้ใช้", () => {
  test("userId ที่ไม่มีในระบบ → NOT_FOUND", async () => {
    const err = await apiErrorOf(() => getOwnProfile("no-such-user"));
    expect(err.code).toBe("NOT_FOUND");
  });

  test("ผู้ใช้ถูก soft delete (deletedAt มีค่า) → NOT_FOUND แม้แถวยังอยู่ใน DB", async () => {
    const gone = await signUpUser({ name: "Gone" });
    await testDb().update(user).set({ deletedAt: new Date() }).where(eq(user.id, gone.id));

    const err = await apiErrorOf(() => getOwnProfile(gone.id));
    expect(err.code).toBe("NOT_FOUND");
  });
});

describe("getOwnProfile — ผู้ใช้ใหม่", () => {
  test("คืนข้อมูลโปรไฟล์ (รวม email/role) และ stats เป็น 0 ทุกช่อง (ไม่ใช่ null)", async () => {
    const fresh = await signUpUser({ name: "Fresh" });

    const profile = await getOwnProfile(fresh.id);

    expect(profile).toMatchObject({
      id: fresh.id,
      name: "Fresh",
      email: fresh.email,
      role: "user",
      bio: null,
      image: null,
    });
    expect(profile.createdAt).toBeInstanceOf(Date);
    expect(profile.stats).toEqual({ sheetCount: 0, publishedCount: 0, totalViews: 0, likeCount: 0 });
  });
});

describe("getOwnProfile — สถิติ", () => {
  // ชุดข้อมูล (alice เป็นเจ้าของ):
  //   published  views 10  → Like จาก bob, Dislike จาก carol
  //   draft      views 5   → Like จาก bob
  //   hidden     views 3   → ไม่มี reaction
  //   published  views 100 → ถูกลบแล้ว (deletedAt) + Like จาก bob   ← ต้องไม่นับทั้งชีทและ Like
  // dave (คนอื่น) มีชีท published views 50 + Like จาก bob           ← ต้องไม่นับเข้า alice
  //
  // ผลที่ถูก: sheetCount 3 · publishedCount 1 · totalViews 18 · likeCount 2
  let alice: TestUser;

  beforeAll(async () => {
    const db = testDb();
    alice = await signUpUser({ name: "Alice" });
    const [bob, carol, dave] = await Promise.all([signUpUser(), signUpUser(), signUpUser()]);

    const [published, draft, , deleted] = await db
      .insert(sheets)
      .values([
        { ownerId: alice.id, title: "published", status: "published", viewCount: 10 },
        { ownerId: alice.id, title: "draft", status: "draft", viewCount: 5 },
        { ownerId: alice.id, title: "hidden", status: "hidden", viewCount: 3 },
        { ownerId: alice.id, title: "deleted", status: "published", viewCount: 100, deletedAt: new Date() },
      ])
      .returning({ id: sheets.id });
    const [daveSheet] = await db
      .insert(sheets)
      .values({ ownerId: dave.id, title: "dave", status: "published", viewCount: 50 })
      .returning({ id: sheets.id });

    await db.insert(sheetReactions).values([
      { userId: bob.id, sheetId: published.id, reaction: "like" },
      { userId: carol.id, sheetId: published.id, reaction: "dislike" },
      { userId: bob.id, sheetId: draft.id, reaction: "like" },
      { userId: bob.id, sheetId: deleted.id, reaction: "like" },
      { userId: bob.id, sheetId: daveSheet.id, reaction: "like" },
    ]);
  });

  test("sheetCount นับทุกสถานะ (draft/hidden ด้วย) ยกเว้นชีทที่ถูกลบ", async () => {
    expect((await getOwnProfile(alice.id)).stats.sheetCount).toBe(3);
  });

  test("publishedCount นับเฉพาะ published ที่ยังไม่ถูกลบ", async () => {
    expect((await getOwnProfile(alice.id)).stats.publishedCount).toBe(1);
  });

  test("totalViews รวมวิวของชีทที่ยังไม่ถูกลบ เป็น number", async () => {
    const { totalViews } = (await getOwnProfile(alice.id)).stats;
    expect(totalViews).toBe(18);
    expect(typeof totalViews).toBe("number");
  });

  test("likeCount นับเฉพาะ Like บนชีทของตัวเองที่ยังไม่ถูกลบ (ไม่นับ Dislike / ชีทคนอื่น)", async () => {
    expect((await getOwnProfile(alice.id)).stats.likeCount).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// ค. parseProfileInput
// ---------------------------------------------------------------------------

describe("parseProfileInput — ช่องที่แก้ไม่ได้", () => {
  test.each([
    ["role", { role: "admin" }],
    ["email", { email: "x@cmlearn.test" }],
    ["id", { id: "other" }],
  ])("ส่ง %s → VALIDATION_ERROR และ details บอกว่าแก้ไขไม่ได้", async (key, raw) => {
    const err = await apiErrorOf(() => parseProfileInput(raw));
    expect(err.code).toBe("VALIDATION_ERROR");
    expect(err.details).toEqual({ [key]: "แก้ไขช่องนี้ไม่ได้" });
  });

  test("ส่ง role มาพร้อม name ที่ถูกต้อง → ยังโดนปฏิเสธทั้งก้อน (ไม่แก้ name ไปครึ่งเดียว)", async () => {
    const err = await apiErrorOf(() => parseProfileInput({ name: "Alice", role: "admin" }));
    expect(err.details).toEqual({ role: "แก้ไขช่องนี้ไม่ได้" });
  });

  test("ผิดหลายช่องพร้อมกัน → details รวมทุกช่อง", async () => {
    const err = await apiErrorOf(() => parseProfileInput({ name: "", bio: 1, email: "x", role: "admin" }));
    expect(Object.keys(err.details ?? {}).sort()).toEqual(["bio", "email", "name", "role"]);
  });
});

describe("parseProfileInput — name", () => {
  test.each([
    ["สตริงว่าง", ""],
    ["มีแต่ช่องว่าง", "   "],
    ["ไม่ใช่ string (ตัวเลข)", 123],
    ["null", null],
  ])("ไม่มีชื่อ → กรุณากรอกชื่อ: %s", async (_label, name) => {
    const err = await apiErrorOf(() => parseProfileInput({ name }));
    expect(err.details).toEqual({ name: "กรุณากรอกชื่อที่แสดง" });
  });

  test(`ยาวเกิน ${NAME_MAX} ตัว → error`, async () => {
    const err = await apiErrorOf(() => parseProfileInput({ name: "ก".repeat(NAME_MAX + 1) }));
    expect(err.details?.name).toContain(String(NAME_MAX));
  });

  test(`ยาวพอดี ${NAME_MAX} ตัว (หลัง trim) → ผ่าน`, () => {
    const name = "ก".repeat(NAME_MAX);
    expect(parseProfileInput({ name: `  ${name}  ` })).toEqual({ name });
  });

  test("trim ช่องว่างหน้า-หลัง", () => {
    expect(parseProfileInput({ name: "  Alice  " })).toEqual({ name: "Alice" });
  });
});

describe("parseProfileInput — bio", () => {
  test("ไม่ใช่ string → ต้องเป็นข้อความ", async () => {
    const err = await apiErrorOf(() => parseProfileInput({ bio: 42 }));
    expect(err.details).toEqual({ bio: "ต้องเป็นข้อความ" });
  });

  test(`ยาวเกิน ${BIO_MAX} ตัว → error`, async () => {
    const err = await apiErrorOf(() => parseProfileInput({ bio: "a".repeat(BIO_MAX + 1) }));
    expect(err.details?.bio).toContain(String(BIO_MAX));
  });

  test(`ยาวเกิน ${BIO_MAX} เพราะช่องว่างหน้า-หลัง → ผ่าน (นับหลัง trim)`, () => {
    const bio = "a".repeat(BIO_MAX);
    expect(parseProfileInput({ bio: `  ${bio}  ` })).toEqual({ bio });
  });

  test.each([
    ["null (ลบ bio)", null],
    ["สตริงว่าง", ""],
    ["มีแต่ช่องว่าง", "   "],
  ])("%s → bio = null", (_label, bio) => {
    expect(parseProfileInput({ bio })).toEqual({ bio: null });
  });

  test("trim ช่องว่างหน้า-หลัง", () => {
    expect(parseProfileInput({ bio: "  สวัสดี  " })).toEqual({ bio: "สวัสดี" });
  });
});

describe("parseProfileInput — image", () => {
  test.each([
    ["null", null],
    ["สตริงว่าง", ""],
  ])("image = %s → ลบรูป (image: null)", (_label, image) => {
    expect(parseProfileInput({ image })).toEqual({ image: null });
  });

  test.each([
    ["URL ภายนอก", "https://evil.example/x.png"],
    ["URL avatar ของคนอื่น", `${prefix("u2")}${UUID}.png`],
  ])("ตั้งรูปผ่าน PATCH ไม่ได้: %s → error บอกให้ใช้ POST avatar", async (_label, image) => {
    const err = await apiErrorOf(() => parseProfileInput({ image }));
    expect(err.details?.image).toContain("POST /api/v1/users/me/avatar");
  });
});

describe("parseProfileInput — ภาพรวม", () => {
  test("body ว่าง {} → ไม่มีข้อมูลที่จะแก้ไข (ไม่มี details)", async () => {
    const err = await apiErrorOf(() => parseProfileInput({}));
    expect(err.code).toBe("VALIDATION_ERROR");
    expect(err.message).toBe("ไม่มีข้อมูลที่จะแก้ไข");
    expect(err.details).toBeUndefined();
  });

  test("ถูกต้องทุกช่อง → คืนเฉพาะช่องที่ส่งมา (trim แล้ว)", () => {
    expect(parseProfileInput({ name: " Alice ", bio: " hi ", image: null })).toEqual({
      name: "Alice",
      bio: "hi",
      image: null,
    });
  });
});
