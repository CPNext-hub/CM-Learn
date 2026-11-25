// ตัวอย่างที่ 3: service ฝั่งหน้าเว็บที่เรียก fetch()
// ใช้กับ: src/services/** และ src/lib/api-client.ts
//
// รูปแบบ: mockFetch({ URL: คำตอบ }) → เรียก service → ตรวจผลลัพธ์ และตรวจว่าเรียก URL ถูกต้อง
// ไม่ต้องใช้ DB: เราทดสอบว่า service "แปลงข้อมูล" และ "จัดการ error" ถูก ส่วน API จริงทดสอบในตัวอย่างที่ 2
import { expect, test } from "vitest";
import { getSheet } from "@/services/sheetService";
import { mockFetch } from "../helpers/fetch";

// ข้อมูลแบบเดียวกับที่ GET /api/v1/sheets/:id ตอบกลับ
const apiSheet = {
  id: "6f1c2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f",
  title: "สรุปฟิสิกส์",
  description: null,
  status: "published",
  viewCount: 10,
  likeCount: 3,
  dislikeCount: 0,
  commentCount: 1,
  owner: { id: "u1", name: "Alice", image: null },
  subject: { id: "s1", name: "ฟิสิกส์" },
  category: null,
  file: { mimeType: "application/pdf", sizeBytes: 2048, versionNo: 1 },
  previewUrl: "/api/v1/sheets/6f1c2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f/download?inline=1",
  downloadUrl: "/api/v1/sheets/6f1c2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f/download",
  createdAt: "2026-11-20T00:00:00.000Z",
  updatedAt: "2026-11-20T00:00:00.000Z",
  viewer: { isOwner: false, reaction: "like" },
};

test("getSheet แปลงข้อมูลจาก API เป็นรูปแบบของหน้ารายละเอียด", async () => {
  const fetchMock = mockFetch({ [`/api/v1/sheets/${apiSheet.id}`]: { data: apiSheet } });

  const sheet = await getSheet(apiSheet.id);

  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(sheet).toMatchObject({
    title: "สรุปฟิสิกส์",
    description: "", // null → ""
    category: "ทั่วไป", // ไม่มีหมวดหมู่ → ค่าเริ่มต้น
    fileType: "PDF",
    stats: { views: 10, likes: 3, dislikes: 0, comments: 1 },
    myReaction: "like",
  });
});

test("API ตอบ error → getSheet โยน Error พร้อมข้อความจาก API", async () => {
  mockFetch({ [`/api/v1/sheets/${apiSheet.id}`]: { status: 404, body: { error: { code: "NOT_FOUND", message: "ไม่พบชีทนี้" } } } });
  await expect(getSheet(apiSheet.id)).rejects.toThrow("ไม่พบชีทนี้");
});

test("เชื่อมต่อไม่ได้ (network error) → ข้อความภาษาไทย", async () => {
  mockFetch({ [`/api/v1/sheets/${apiSheet.id}`]: new TypeError("Failed to fetch") });
  await expect(getSheet(apiSheet.id)).rejects.toThrow("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้");
});
