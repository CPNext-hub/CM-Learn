// sizeLabel() ใน src/lib/api-client.ts — ย้ายมาจาก tests/size-label.test.mjs (เดิมใช้ node:test)
// เจ้าของไฟล์ api-client.ts (FE02) เขียน test ส่วนที่เหลือต่อในไฟล์นี้
import { expect, test } from "vitest";
import { sizeLabel } from "@/lib/api-client";

test("ไม่มีขนาดไฟล์ → คืน —", () => {
  expect(sizeLabel(null)).toBe("—");
  expect(sizeLabel(undefined)).toBe("—");
});

test("ไฟล์เล็กกว่า 1 MB → แสดงเป็น KB", () => {
  expect(sizeLabel(2048)).toBe("2 KB");
});

test("ไฟล์ตั้งแต่ 1 MB → แสดงเป็น MB", () => {
  expect(sizeLabel(5 * 1024 * 1024)).toBe("5.0 MB");
});

// ฟังก์ชันไม่มีหน่วย GB (ไฟล์อัปโหลดได้ไม่เกิน 50 MB) จึงแสดงเป็น MB
test("ไฟล์ 1 GB → แสดงเป็น 1024.0 MB", () => {
  expect(sizeLabel(1024 * 1024 * 1024)).toBe("1024.0 MB");
});
