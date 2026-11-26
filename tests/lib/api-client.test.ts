import { vi } from "vitest";
import { mockFetch } from "../helpers/fetch";
import {
  AVATAR_ACCEPT,
  AVATAR_MAX_BYTES,
  SHEET_ACCEPT,
  SHEET_MAX_BYTES,
  STATUS_LABEL,
  api,
  errorText,
  fileLabel,
  initials,
  jsonInit,
  loadLookups,
} from "@/lib/api-client";

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

test("api สำเร็จ → คืน data และ pagination", async () => {
  const fetchMock = mockFetch({
    "/api/v1/sheets": {
      data: [{ id: "s1" }],
      pagination: { page: 1, pageSize: 10, total: 1, totalPages: 1 },
    },
  });
  const result = await api<{ id: string }[]>("/api/v1/sheets");

  expect(fetchMock).toHaveBeenCalledWith("/api/v1/sheets", undefined);
  expect(result).toEqual({
    ok: true,
    status: 200,
    data: [{ id: "s1" }],
    pagination: { page: 1, pageSize: 10, total: 1, totalPages: 1 },
  });
});

test("api error cases → จัดการ HTTP error, JSON เสีย และ network error", async () => {
  mockFetch({
    "/api/v1/sheets/missing": {
      status: 404,
      body: { error: { code: "NOT_FOUND", message: "Missing" } },
    },
  });
  await expect(api("/api/v1/sheets/missing")).resolves.toEqual({
    ok: false,
    status: 404,
    error: { code: "NOT_FOUND", message: "Missing" },
  });

  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("not json", { status: 500 })));
  await expect(api("/api/v1/sheets")).resolves.toEqual({
    ok: false,
    status: 500,
    error: { code: "UNKNOWN", message: "เกิดข้อผิดพลาด กรุณาลองอีกครั้ง" },
  });

  mockFetch({ "/api/v1/sheets": new TypeError("offline") });
  await expect(api("/api/v1/sheets")).resolves.toEqual({
    ok: false,
    status: 0,
    error: { code: "NETWORK", message: "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้" },
  });
});

test("jsonInit → สร้าง request ที่มี JSON method, header และ body", () => {
  expect(jsonInit("PATCH", { name: "Panu" })).toEqual({
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Panu" }),
  });
});

test("errorText → รวม field details และไม่แสดงข้อความซ้ำ", () => {
  expect(errorText({ code: "INVALID", message: "Check fields" })).toBe("Check fields");
  expect(errorText({ code: "INVALID", message: "Check fields", details: { title: "Required", bio: "Too long" } }))
    .toBe("Check fields: Required · Too long");
  expect(errorText({ code: "INVALID", message: "Same", details: { title: "Same" } })).toBe("Same");
});

test("file labels, initials และ upload settings → แสดงค่าถูกต้อง", () => {
  expect(fileLabel(null)).toBe("FILE");
  expect(fileLabel("application/pdf")).toBe("PDF");
  expect(fileLabel("image/jpeg")).toBe("JPG");
  expect(fileLabel("application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toBe("DOCX");
  expect(fileLabel("application/vnd.openxmlformats-officedocument.presentationml.presentation")).toBe("PPTX");
  expect(fileLabel("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")).toBe("XLSX");
  expect(fileLabel("application/octet-stream")).toBe("FILE");
  expect(initials("  panu   nu  ")).toBe("PN");
  expect(initials("alice")).toBe("A");
  expect(initials("   ")).toBe("?");
  expect(STATUS_LABEL).toEqual({ published: "เผยแพร่", draft: "ร่าง", hidden: "ซ่อน" });
  expect(SHEET_ACCEPT).toContain(".pdf");
  expect(SHEET_MAX_BYTES).toBe(50 * 1024 * 1024);
  expect(AVATAR_ACCEPT).toContain(".png");
  expect(AVATAR_MAX_BYTES).toBe(2 * 1024 * 1024);
});

test("loadLookups → คืนรายการที่สำเร็จและใช้ array ว่างเมื่อ endpoint error", async () => {
  mockFetch({
    "/api/v1/subjects": { data: [{ id: "sub1", name: "Math" }] },
    "/api/v1/categories": {
      status: 500,
      body: { error: { code: "INTERNAL_ERROR", message: "Oops" } },
    },
  });
  await expect(loadLookups()).resolves.toEqual({
    subjects: [{ id: "sub1", name: "Math" }],
    categories: [],
  });

  mockFetch({
    "/api/v1/subjects": {
      status: 500,
      body: { error: { code: "INTERNAL_ERROR", message: "Oops" } },
    },
    "/api/v1/categories": { data: [{ id: "cat1", name: "Basics" }] },
  });
  await expect(loadLookups()).resolves.toEqual({
    subjects: [],
    categories: [{ id: "cat1", name: "Basics" }],
  });
});
