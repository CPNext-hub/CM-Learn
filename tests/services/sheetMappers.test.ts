import { describe, expect, test } from "vitest";
import type { ApiSheet } from "@/services/sheetMappers";
import {
    apiOrThrow,
    coverUrl,
    subjectName,
    categoryName,
    displayFileName,
    sheetsUrl,
} from "@/services/sheetMappers";
import { mockFetch } from "../helpers/fetch";

// ข้อมูลจำลองสำหรับใช้ทดสอบ
const mockSheet: ApiSheet = {
    id: "sheet-001",
    title: "สรุปฟิสิกส์",
    description: "เนื้อหาวิชาฟิสิกส์",
    status: "published",
    viewCount: 10,
    likeCount: 5,
    dislikeCount: 0,
    commentCount: 2,
    owner: {
        id: "user-001",
        name: "Alice",
        image: null,
    },
    subject: {
        id: "subject-001",
        name: "ฟิสิกส์",
    },
    category: {
        id: "category-001",
        name: "สรุปเนื้อหา",
    },
    file: {
        mimeType: "application/pdf",
        sizeBytes: 2048,
        versionNo: 1,
    },
    previewUrl: "/preview/file",
    downloadUrl: "/download/file",
    createdAt: "2026-11-20T00:00:00.000Z",
    updatedAt: "2026-11-20T00:00:00.000Z",
    viewer: {
        isOwner: false,
        reaction: null,
    },
};

describe("sheetMappers", () => {
    // 1. apiOrThrow
    describe("apiOrThrow", () => {
        test("เรียก API สำเร็จและคืนข้อมูล", async () => {
            mockFetch({
                "/test": { data: { message: "success" } },
            });

            const result = await apiOrThrow<{ message: string }>("/test");

            expect(result.data).toEqual({ message: "success" });
        });

        test("API ตอบ error แล้วโยน Error พร้อมข้อความ", async () => {
            mockFetch({
                "/test": {
                    status: 404,
                    body: {
                        error: {
                            code: "NOT_FOUND",
                            message: "ไม่พบข้อมูล",
                        },
                    },
                },
            });

            await expect(apiOrThrow("/test")).rejects.toThrow("ไม่พบข้อมูล");
        });
    });

    // 2. coverUrl
    describe("coverUrl", () => {
        test("ไฟล์รูปภาพต้องคืนค่า previewUrl", () => {
            const sheet = {
                ...mockSheet,
                file: {
                    mimeType: "image/png",
                    sizeBytes: 2048,
                    versionNo: 1,
                },
            };

            expect(coverUrl(sheet)).toBe("/preview/file");
        });

        test("ไฟล์ PDF ต้องคืนค่า null", () => {
            expect(coverUrl(mockSheet)).toBeNull();
        });
    });

    // 3. subjectName
    describe("subjectName", () => {
        test("มีวิชาให้คืนชื่อวิชา", () => {
            expect(subjectName(mockSheet)).toBe("ฟิสิกส์");
        });

        test("ไม่มีวิชาให้คืนค่าเริ่มต้น", () => {
            expect(subjectName({ ...mockSheet, subject: null })).toBe("ไม่ระบุวิชา");
        });
    });

    // 4. categoryName
    describe("categoryName", () => {
        test("มีหมวดหมู่ให้คืนชื่อหมวดหมู่", () => {
            expect(categoryName(mockSheet)).toBe("สรุปเนื้อหา");
        });

        test("ไม่มีหมวดหมู่ให้คืนค่าเริ่มต้น", () => {
            expect(categoryName({ ...mockSheet, category: null })).toBe("ทั่วไป");
        });
    });

    // 5. displayFileName
    describe("displayFileName", () => {
        test("มีไฟล์ PDF ให้คืนชื่อพร้อมนามสกุล", () => {
            expect(displayFileName(mockSheet)).toBe("สรุปฟิสิกส์.pdf");
        });

        test("ไม่มีไฟล์ให้คืนเฉพาะชื่อชีท", () => {
            expect(displayFileName({ ...mockSheet, file: null })).toBe("สรุปฟิสิกส์");
        });

        test("ไฟล์รูปภาพ PNG ต้องใช้นามสกุล png", () => {
            const sheet = {
                ...mockSheet,
                file: {
                    mimeType: "image/png",
                    sizeBytes: 2048,
                    versionNo: 1,
                },
            };

            expect(displayFileName(sheet)).toBe("สรุปฟิสิกส์.png");
        });
    });

    // 6. sheetsUrl
    describe("sheetsUrl", () => {
        test("สร้าง URL พร้อมพารามิเตอร์ที่กำหนด", () => {
            expect(
                sheetsUrl({
                    subjectId: "subject-001",
                    page: 2,
                    sort: "popular",
                })
            ).toBe(
                "/api/v1/sheets?subjectId=subject-001&page=2&sort=popular"
            );
        });

        test("ไม่เพิ่มพารามิเตอร์ที่เป็น undefined หรือค่าว่าง", () => {
            expect(
                sheetsUrl({
                    subjectId: "subject-001",
                    page: undefined,
                    keyword: "",
                })
            ).toBe("/api/v1/sheets?subjectId=subject-001");
        });
    });
});