// src/lib/session.ts — ดูว่าใครล็อกอินอยู่ ฝั่งหน้าเว็บที่ render บน server (เช่น หน้า /admin)
// ก. getSession  ข. requireUser  ค. requireAdmin  ง. บัญชีที่ถูกลบ = guest
//
// headers() ของ next/headers ใช้ได้เฉพาะตอน Next.js render จริง → mock ให้คืน cookie ที่เราตั้งเอง
// vi.mock ถูกย้ายไปบนสุดของไฟล์ จึงเก็บค่า cookie ใน vi.hoisted (ดู tests/README.md หัวข้อ 4)
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { user } from "@/db/schema";
import { getSession, requireAdmin, requireUser } from "@/lib/session";
import { signUpAdmin, signUpUser } from "../helpers/auth";
import { cleanDbBeforeAll, testDb } from "../helpers/db";

const mocks = vi.hoisted(() => ({ cookie: "" }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(mocks.cookie ? { cookie: mocks.cookie } : {}),
}));

cleanDbBeforeAll();

beforeEach(() => {
  mocks.cookie = ""; // ทุก test เริ่มเป็น guest
});

// ---------------------------------------------------------------------------
// ก. getSession
// ---------------------------------------------------------------------------

describe("getSession", () => {
  test("ไม่มี cookie → null", async () => {
    expect(await getSession()).toBeNull();
  });

  test("cookie ถูกต้อง → ได้ session ของผู้ใช้คนนั้น", async () => {
    const alice = await signUpUser({ name: "Alice" });
    mocks.cookie = alice.cookie;

    const session = await getSession();

    expect(session?.user).toMatchObject({ id: alice.id, email: alice.email, name: "Alice" });
    expect(session?.session.userId).toBe(alice.id);
  });

  test("cookie ปลอม (token มั่ว) → null", async () => {
    mocks.cookie = "better-auth.session_token=forged-token.forged-signature";
    expect(await getSession()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// ข. requireUser
// ---------------------------------------------------------------------------

describe("requireUser", () => {
  test("guest → null", async () => {
    expect(await requireUser()).toBeNull();
  });

  test("ล็อกอินแล้ว → ได้ session ของคนนั้น", async () => {
    const bob = await signUpUser();
    mocks.cookie = bob.cookie;
    expect((await requireUser())?.user.id).toBe(bob.id);
  });
});

// ---------------------------------------------------------------------------
// ค. requireAdmin
// ---------------------------------------------------------------------------

describe("requireAdmin", () => {
  test("guest → null", async () => {
    expect(await requireAdmin()).toBeNull();
  });

  test("ผู้ใช้ธรรมดา (role user) → null", async () => {
    const carol = await signUpUser();
    mocks.cookie = carol.cookie;
    expect(await requireAdmin()).toBeNull();
  });

  test("admin → ได้ session ที่ role = admin", async () => {
    const admin = await signUpAdmin();
    mocks.cookie = admin.cookie;
    const session = await requireAdmin();
    expect(session?.user).toMatchObject({ id: admin.id, role: "admin" });
  });
});

// ---------------------------------------------------------------------------
// ง. บัญชีที่ถูกลบ
// ---------------------------------------------------------------------------

describe("บัญชีที่ถูกลบ (deletedAt)", () => {
  // เคยเป็น bug (พบวันที่ 2): session.ts ไม่ตรวจ deletedAt → บัญชีที่ถูกลบ (รวม admin) ยังได้ session
  // และยังผ่าน requireAdmin() / หน้า /admin ได้ · แก้แล้ว: getSession() ถือว่าบัญชีที่ถูกลบเป็น guest
  // เหมือน getSessionUser() ใน api.ts
  test("บัญชี admin ถูกลบแต่ cookie ยังใช้ได้ → getSession / requireUser / requireAdmin ได้ null", async () => {
    const admin = await signUpUser({ name: "Deleted Admin" });
    await testDb().update(user).set({ role: "admin", deletedAt: new Date() }).where(eq(user.id, admin.id));
    mocks.cookie = admin.cookie;

    expect(await getSession()).toBeNull();
    expect(await requireUser()).toBeNull();
    expect(await requireAdmin()).toBeNull();
  });
});
