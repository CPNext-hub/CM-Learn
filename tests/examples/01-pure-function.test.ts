// ตัวอย่างที่ 1: ฟังก์ชันล้วน (ไม่ใช้ DB, ไม่ใช้ fetch)
// ใช้กับ: sheetMappers.ts, storage.ts (ตรวจชนิดไฟล์), api-client.ts (sizeLabel, errorText …), ส่วนอ่านค่าใน api.ts
//
// รูปแบบ: เตรียม input → เรียกฟังก์ชัน → ตรวจผลด้วย expect(...)
import { describe, expect, test } from "vitest";
import { ApiError, buildPagination, isUuid, optionalUuidParam, parseIdParam, parsePagination } from "@/lib/api";

describe("parsePagination", () => {
  test("ไม่ส่งอะไรมา → หน้า 1, หน้าละ 12", () => {
    expect(parsePagination(new URLSearchParams())).toEqual({ page: 1, pageSize: 12, offset: 0 });
  });

  test("หน้า 3 หน้าละ 10 → ข้าม 20 รายการ", () => {
    expect(parsePagination(new URLSearchParams("page=3&pageSize=10"))).toEqual({ page: 3, pageSize: 10, offset: 20 });
  });

  test("pageSize เกิน 50 → ถูกจำกัดที่ 50", () => {
    expect(parsePagination(new URLSearchParams("pageSize=999")).pageSize).toBe(50);
  });
});

test("buildPagination: 25 รายการ หน้าละ 10 → 3 หน้า", () => {
  expect(buildPagination(1, 10, 25)).toEqual({ page: 1, pageSize: 10, total: 25, totalPages: 3 });
});

test("isUuid แยก UUID จริงกับข้อความอื่น", () => {
  expect(isUuid("6f1c2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f")).toBe(true);
  expect(isUuid("abc")).toBe(false);
});

// การตรวจว่าโยน error: ใช้ expect(() => ...).toThrow(...)
test("parseIdParam: id ผิดรูปแบบ → ApiError NOT_FOUND", () => {
  expect(() => parseIdParam("not-a-uuid")).toThrow(ApiError);
  expect(() => parseIdParam("not-a-uuid")).toThrow("ไม่พบข้อมูล");
});

test("optionalUuidParam: ไม่มีค่า → undefined, ค่าผิด → VALIDATION_ERROR พร้อม details", () => {
  expect(optionalUuidParam(new URLSearchParams(), "subjectId")).toBeUndefined();
  try {
    optionalUuidParam(new URLSearchParams("subjectId=x"), "subjectId");
    expect.unreachable("ควรโยน error");
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe("VALIDATION_ERROR");
    expect((error as ApiError).details).toEqual({ subjectId: "ต้องเป็น UUID" });
  }
});
