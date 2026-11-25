// ตัวอย่างที่ 2: API route กับ DB จริง (cmlearn_test)
// ใช้กับ: ทุกไฟล์ใน src/app/api/** และ lib ที่คุยกับ DB (sheets.ts, users.ts, auth.ts …)
//
// รูปแบบ:
//   1. cleanDbBeforeAll()     → เริ่มไฟล์ด้วยตารางว่าง
//   2. signUpUser()           → ผู้ใช้จริง + cookie ล็อกอิน
//   3. เรียก GET/POST ของ route ตรง ๆ ด้วย request(...)  (ไม่ต้องเปิดเซิร์ฟเวอร์)
//   4. ตรวจ status, body และข้อมูลใน DB
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, test } from "vitest";
import { GET as getSheet } from "@/app/api/v1/sheets/[id]/route";
import { POST as createSheet } from "@/app/api/v1/sheets/route";
import { sheetFiles, sheets } from "@/db/schema";
import { signUpUser, type TestUser } from "../helpers/auth";
import { cleanDbBeforeAll, lookups, testDb } from "../helpers/db";
import { fakePdfFile, pdfFile, sheetForm } from "../helpers/files";
import { json, params, request } from "../helpers/request";

cleanDbBeforeAll();

let alice: TestUser;
beforeAll(async () => {
  alice = await signUpUser({ name: "Alice" });
});

describe("POST /api/v1/sheets (ตัวอย่าง)", () => {
  test("ไม่ล็อกอิน → 401", async () => {
    const res = await createSheet(request("/api/v1/sheets", { method: "POST", form: sheetForm({ title: "x", file: pdfFile() }) }));
    expect(res.status).toBe(401);
    expect((await json(res)).error.code).toBe("UNAUTHORIZED");
  });

  test("ไฟล์ปลอม (ข้อความที่เปลี่ยนชื่อเป็น .pdf) → 415", async () => {
    const form = sheetForm({ title: "ไฟล์ปลอม", file: fakePdfFile() });
    const res = await createSheet(request("/api/v1/sheets", { method: "POST", form, cookie: alice.cookie }));
    expect(res.status).toBe(415);
  });

  test("อัปโหลด PDF สำเร็จ → 201 และมีแถวใน DB", async () => {
    const { subjects } = await lookups();
    const form = sheetForm({ title: "สรุปแคลคูลัส", subjectId: subjects[0].id, file: pdfFile() });
    const res = await createSheet(request("/api/v1/sheets", { method: "POST", form, cookie: alice.cookie }));

    expect(res.status).toBe(201);
    const { data } = await json(res);
    expect(data).toMatchObject({ title: "สรุปแคลคูลัส", status: "published", owner: { id: alice.id } });
    expect(data.file.mimeType).toBe("application/pdf");

    // ตรวจใน DB จริงว่าข้อมูลถูกบันทึก
    const [row] = await testDb().select().from(sheets).where(eq(sheets.id, data.id));
    expect(row.ownerId).toBe(alice.id);
    const files = await testDb().select().from(sheetFiles).where(eq(sheetFiles.sheetId, data.id));
    expect(files).toHaveLength(1);

    // route ที่มี [id]: ส่ง params({ id }) เป็นอาร์กิวเมนต์ที่ 2
    const detail = await getSheet(request(`/api/v1/sheets/${data.id}`), params({ id: data.id }));
    expect(detail.status).toBe(200);
  });
});
