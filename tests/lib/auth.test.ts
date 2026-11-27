// src/lib/auth.ts — ตั้งค่า Better Auth (สมัคร/ล็อกอิน) ของทั้งระบบ
// ก. getAuth ใช้ instance เดิมต่อ DB client
// ข. รหัสผ่านขั้นต่ำ 8 ตัว
// ค. ผู้ใช้ส่ง role / bio / deletedAt มาเองตอนสมัครไม่ได้ (input: false)
// ง. ADMIN_EMAILS → role admin
// จ. ค่าเริ่มต้นเมื่อไม่ได้ตั้ง env
// (การส่งต่อผ่าน route /api/auth/* อยู่ใน tests/api/auth.test.ts)
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, test, vi } from "vitest";
import { getDb } from "@/db/client";
import { user } from "@/db/schema";
import { getAuth } from "@/lib/auth";
import { TEST_PASSWORD } from "../helpers/auth";
import { cleanDbBeforeAll, testDb } from "../helpers/db";
import { TEST_ADMIN_EMAIL } from "../setup/test-env";

cleanDbBeforeAll();

let counter = 0;
const uniqueEmail = (label: string) => `${label}-${Date.now()}-${++counter}@cmlearn.test`;

/** สมัครผ่าน Better Auth API ตรง ๆ (ไม่ผ่าน route) */
async function signUp(body: Record<string, unknown>) {
  const auth = await getAuth();
  return auth.api.signUpEmail({ body: { name: "ผู้ทดสอบ", password: TEST_PASSWORD, ...body } as never });
}

async function findUser(email: string) {
  const [row] = await testDb().select().from(user).where(eq(user.email, email.toLowerCase()));
  return row;
}

// ---------------------------------------------------------------------------
// ก. getAuth
// ---------------------------------------------------------------------------

describe("getAuth", () => {
  test("เรียก 2 ครั้งด้วย DB เดิม → ได้ instance ตัวเดียวกัน", async () => {
    expect(await getAuth()).toBe(await getAuth());
  });

  test("DB client ต่างกัน (DATABASE_URL ต่าง) → สร้าง instance ใหม่", async () => {
    const originalUrl = process.env.DATABASE_URL!;
    const first = await getAuth();
    const firstDb = getDb();
    try {
      const url = new URL(originalUrl);
      url.searchParams.set("application_name", "auth_test");
      process.env.DATABASE_URL = url.toString();

      expect(getDb()).not.toBe(firstDb); // ยืนยันก่อนว่าได้ pool ใหม่จริง
      const second = await getAuth();
      expect(second).not.toBe(first);
      expect(await getAuth()).toBe(second); // DB ใหม่ก็ใช้ instance ซ้ำเหมือนกัน
    } finally {
      process.env.DATABASE_URL = originalUrl;
    }
    expect(await getAuth()).toBe(first); // กลับมา URL เดิม → instance เดิม
  });
});

// ---------------------------------------------------------------------------
// ข. รหัสผ่านขั้นต่ำ
// ---------------------------------------------------------------------------

describe("รหัสผ่านขั้นต่ำ 8 ตัว", () => {
  test("รหัส 7 ตัว → ถูกปฏิเสธ และไม่มี user ใน DB", async () => {
    const email = uniqueEmail("short");
    await expect(signUp({ email, password: "1234567" })).rejects.toThrow();
    expect(await findUser(email)).toBeUndefined();
  });

  test("รหัสพอดี 8 ตัว → สมัครได้", async () => {
    const email = uniqueEmail("exact8");
    const result = await signUp({ email, password: "12345678" });
    expect(result.user.email).toBe(email);
    expect(await findUser(email)).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// ค. ช่องพิเศษส่งมาเองไม่ได้
// ---------------------------------------------------------------------------

describe("ห้ามส่งช่องพิเศษตอนสมัคร (input: false)", () => {
  test.each([
    ["role", "admin"],
    ["bio", "แอบตั้ง bio"],
    ["deletedAt", new Date("2020-01-01").toISOString()],
  ])("ส่ง %s มาเอง → ค่านั้นต้องไม่ถูกบันทึกลง DB", async (field, value) => {
    const email = uniqueEmail(`field-${field}`);

    // Better Auth อาจปฏิเสธ (โยน error) หรือเมินช่องนั้น — ยอมรับทั้งสองแบบ
    // สิ่งที่ห้ามเด็ดขาดคือค่าที่ผู้ใช้ส่งมาถูกบันทึกจริง
    const outcome = await signUp({ email, [field]: value }).then(
      () => "accepted" as const,
      () => "rejected" as const,
    );

    const saved = await findUser(email);
    if (outcome === "rejected") {
      expect(saved).toBeUndefined();
    } else {
      expect(saved).toMatchObject({ role: "user", bio: null, deletedAt: null });
    }
  });
});

// ---------------------------------------------------------------------------
// ง. ADMIN_EMAILS
// ---------------------------------------------------------------------------

describe("ADMIN_EMAILS", () => {
  const originalAdminEmails = process.env.ADMIN_EMAILS;
  afterEach(() => {
    process.env.ADMIN_EMAILS = originalAdminEmails;
  });

  test("อีเมลตรงกับ ADMIN_EMAILS → role admin ใน DB", async () => {
    await signUp({ email: TEST_ADMIN_EMAIL });
    expect((await findUser(TEST_ADMIN_EMAIL)).role).toBe("admin");
  });

  test.each(["boss@cmlearn.test", "other@x.test"])(
    "ADMIN_EMAILS มีช่องว่าง/ตัวพิมพ์ใหญ่/หลายอีเมล → %s ได้ admin",
    async (email) => {
      process.env.ADMIN_EMAILS = " Boss@CMLearn.test , other@x.test ";
      await signUp({ email });
      expect((await findUser(email)).role).toBe("admin");
    },
  );

  test("อีเมลไม่อยู่ใน ADMIN_EMAILS → role user", async () => {
    const email = uniqueEmail("normal");
    await signUp({ email });
    expect((await findUser(email)).role).toBe("user");
  });

  test("ไม่ได้ตั้ง ADMIN_EMAILS เลย → อีเมลที่เคยเป็น admin ก็ได้แค่ user", async () => {
    delete process.env.ADMIN_EMAILS; // ใช้ทาง ?? "" ในโค้ด
    await signUp({ email: "unset-admin@cmlearn.test" });
    expect((await findUser("unset-admin@cmlearn.test")).role).toBe("user");
  });
});

// ---------------------------------------------------------------------------
// จ. ค่าเริ่มต้นเมื่อไม่ได้ตั้ง env
// ---------------------------------------------------------------------------

describe("ค่าเริ่มต้นของ config", () => {
  const KEYS = [
    "BETTER_AUTH_URL",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "FACEBOOK_CLIENT_ID",
    "FACEBOOK_CLIENT_SECRET",
  ] as const;

  test("ไม่ตั้ง BETTER_AUTH_URL / GOOGLE_* / FACEBOOK_* → baseURL localhost:3000 และ client id/secret เป็นค่าว่าง", async () => {
    const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
    try {
      for (const k of KEYS) delete process.env[k];
      vi.resetModules(); // โหลด auth.ts ใหม่ → WeakMap ใหม่ → createAuth() อ่าน env ตอนนี้
      const fresh = await import("@/lib/auth");
      const { options } = await fresh.getAuth();

      expect(options.baseURL).toBe("http://localhost:3000");
      expect(options.socialProviders?.google).toMatchObject({ clientId: "", clientSecret: "" });
      expect(options.socialProviders?.facebook).toMatchObject({ clientId: "", clientSecret: "" });
    } finally {
      for (const k of KEYS) {
        if (saved[k] === undefined) delete process.env[k];
        else process.env[k] = saved[k];
      }
      vi.resetModules();
    }
  });
});
