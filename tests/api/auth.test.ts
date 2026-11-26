// src/app/api/auth/[...all]/route.ts — ประตูเดียวของระบบล็อกอิน: ทุก /api/auth/* ส่งต่อให้ Better Auth
// test ว่า GET/POST ส่งต่อถูกที่ และ Response (รวม Set-Cookie) ออกมาครบ
// (รหัสผ่านขั้นต่ำ, ADMIN_EMAILS, การใช้ instance เดิม → อยู่ใน tests/lib/auth.test.ts วันที่ 2)
import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";
import { GET, POST } from "@/app/api/auth/[...all]/route";
import { account, session, user } from "@/db/schema";
import { signUpUser, TEST_PASSWORD } from "../helpers/auth";
import { cleanDbBeforeAll, testDb } from "../helpers/db";
import { request } from "../helpers/request";

cleanDbBeforeAll();

// Better Auth ตั้งชื่อ cookie ด้วย prefix "better-auth" (ค่าเริ่มต้น)
const SESSION_COOKIE = "better-auth.session_token";

/** Set-Cookie → "name=value; name2=value2" สำหรับส่งต่อ (ตัด cookie ที่ค่าว่าง = ถูกลบ ออก) แบบเดียวกับ signUpUser() */
function cookieFrom(res: Response) {
  return res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .filter((c) => !c.endsWith("="))
    .join("; ");
}

/** Response นี้ตั้ง session cookie ที่มีค่าจริงไหม */
function setsSessionCookie(res: Response) {
  return res.headers.getSetCookie().some((c) => c.startsWith(`${SESSION_COOKIE}=`) && !c.startsWith(`${SESSION_COOKIE}=;`));
}

async function getSession(cookie?: string) {
  const res = await GET(request("/api/auth/get-session", { cookie }));
  expect(res.status).toBe(200);
  return (await res.json()) as { user: { id: string; email: string } } | null;
}

describe("POST /api/auth/sign-up/email", () => {
  test("สมัครสำเร็จ → 200, ได้ session cookie, บันทึก user + account ลง DB และเก็บรหัสผ่านเป็น hash", async () => {
    const email = `signup-${Date.now()}@cmlearn.test`;
    const res = await POST(
      request("/api/auth/sign-up/email", {
        method: "POST",
        json: { name: "สมัครใหม่", email, password: TEST_PASSWORD },
      }),
    );

    expect(res.status).toBe(200);
    expect(setsSessionCookie(res)).toBe(true);
    const body = (await res.json()) as { user: { id: string; email: string } };
    expect(body.user.email).toBe(email);

    const [saved] = await testDb().select().from(user).where(eq(user.id, body.user.id));
    expect(saved).toMatchObject({ email, name: "สมัครใหม่", role: "user" });

    const [credential] = await testDb().select().from(account).where(eq(account.userId, body.user.id));
    expect(credential.providerId).toBe("credential");
    expect(credential.password).toBeTruthy();
    expect(credential.password).not.toBe(TEST_PASSWORD);
    expect(credential.password).not.toContain(TEST_PASSWORD);
  });
});

describe("GET /api/auth/get-session", () => {
  test("มี cookie → 200 ได้ผู้ใช้คนนั้น", async () => {
    const alice = await signUpUser();
    const result = await getSession(alice.cookie);
    expect(result?.user).toMatchObject({ id: alice.id, email: alice.email });
  });

  test("ไม่มี cookie → 200 body เป็น null (guest)", async () => {
    expect(await getSession()).toBeNull();
  });
});

describe("POST /api/auth/sign-in/email", () => {
  test("รหัสถูก → 200 และได้ cookie ใหม่ที่ใช้ get-session ได้", async () => {
    const bob = await signUpUser();
    const res = await POST(
      request("/api/auth/sign-in/email", { method: "POST", json: { email: bob.email, password: bob.password } }),
    );

    expect(res.status).toBe(200);
    expect(setsSessionCookie(res)).toBe(true);
    const result = await getSession(cookieFrom(res));
    expect(result?.user.id).toBe(bob.id);
  });

  test("รหัสผิด → 401 และไม่ได้ session cookie", async () => {
    const carol = await signUpUser();
    const res = await POST(
      request("/api/auth/sign-in/email", { method: "POST", json: { email: carol.email, password: "wrong-password" } }),
    );

    expect(res.status).toBe(401);
    expect(setsSessionCookie(res)).toBe(false);
  });
});

describe("POST /api/auth/sign-out", () => {
  test("ออกจากระบบ → cookie เดิมใช้ไม่ได้แล้ว และ session ถูกลบจาก DB", async () => {
    const dave = await signUpUser();
    expect((await getSession(dave.cookie))?.user.id).toBe(dave.id); // ก่อน sign-out ยังใช้ได้

    const res = await POST(request("/api/auth/sign-out", { method: "POST", json: {}, cookie: dave.cookie }));
    expect(res.status).toBe(200);

    expect(await getSession(dave.cookie)).toBeNull();
    const rows = await testDb().select().from(session).where(eq(session.userId, dave.id));
    expect(rows).toHaveLength(0);
  });
});

describe("path ที่ไม่มีอยู่", () => {
  test("GET /api/auth/ไม่มีจริง → 404", async () => {
    const res = await GET(request("/api/auth/does-not-exist"));
    expect(res.status).toBe(404);
  });
});
