import { describe, expect, test } from "vitest";
import {
    getSheet,
    getRelatedSheets,
} from "@/services/sheetService";
import type { ApiSheet } from "@/services/sheetMappers";
import type { Sheet } from "@/types/sheet";
import { mockFetch } from "../helpers/fetch";

// ข้อมูลจำลองจาก API
const mockApiSheet: ApiSheet = {
    id: "sheet-001",
    title: "สรุปฟิสิกส์",
    description: "เนื้อหาวิชาฟิสิกส์",
    status: "published",
    viewCount: 10,
    likeCount: 5,
    dislikeCount: 1,
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
        reaction: "like",
    },
};

describe("sheetService", () => {
    describe("getSheet", () => {
        test("ดึงข้อมูลชีทและแปลงเป็นรูปแบบหน้าเว็บ", async () => {
            mockFetch({
                "/api/v1/sheets/sheet-001": {
                    data: mockApiSheet,
                },
            });

            const result = await getSheet("sheet-001");

            expect(result).toMatchObject({
                id: "sheet-001",
                title: "สรุปฟิสิกส์",
                description: "เนื้อหาวิชาฟิสิกส์",
                subjectId: "subject-001",
                subjectName: "ฟิสิกส์",
                category: "สรุปเนื้อหา",
                fileType: "PDF",
                fileName: "สรุปฟิสิกส์.pdf",
                fileSize: 2048,
                isImage: false,
                myReaction: "like",
                isOwner: false,
            });

            expect(result.stats).toEqual({
                views: 10,
                likes: 5,
                dislikes: 1,
                comments: 2,
            });
        });

        test("API error ต้องโยน Error", async () => {
            mockFetch({
                "/api/v1/sheets/sheet-001": {
                    status: 404,
                    body: {
                        error: {
                            code: "NOT_FOUND",
                            message: "ไม่พบข้อมูล",
                        },
                    },
                },
            });

            await expect(getSheet("sheet-001")).rejects.toThrow("ไม่พบข้อมูล");
        });

        test("รองรับข้อมูลที่ไม่มี description, file และ viewer", async () => {
            const incompleteSheet: ApiSheet = {
                ...mockApiSheet,
                description: null,
                subject: null,
                category: null,
                file: null,
                viewer: undefined,
            };

            mockFetch({
                "/api/v1/sheets/sheet-001": {
                    data: incompleteSheet,
                },
            });

            const result = await getSheet("sheet-001");

            expect(result).toMatchObject({
                description: "",
                subjectId: null,
                category: "ทั่วไป",
                fileType: "",
                fileName: mockApiSheet.title,
                fileSize: 0,
                isImage: false,
                myReaction: null,
                isOwner: false,
            });
        });

        test("ตรวจสอบไฟล์รูปภาพ", async () => {
            const imageSheet: ApiSheet = {
                ...mockApiSheet,
                file: {
                    mimeType: "image/png",
                    sizeBytes: 4096,
                    versionNo: 1,
                },
            };

            mockFetch({
                "/api/v1/sheets/sheet-001": {
                    data: imageSheet,
                },
            });

            const result = await getSheet("sheet-001");

            expect(result).toMatchObject({
                fileType: "PNG",
                fileName: `${mockApiSheet.title}.png`,
                fileSize: 4096,
                isImage: true,
            });
        });

    });

    
    describe("getRelatedSheets", () => {
        test("ไม่มี subjectId ต้องคืน array ว่าง", async () => {
            const fetchMock = mockFetch({});

            const sheet = {
                subjectId: null,
            } as Sheet;

            const result = await getRelatedSheets(sheet);

            expect(result).toEqual([]);
            expect(fetchMock).not.toHaveBeenCalled();
        });

        test("เมื่อ API ไม่มีชีทอื่นที่เกี่ยวข้อง ต้องคืน array ว่าง", async () => {
            mockFetch({
                "/api/v1/sheets": {
                    data: [mockApiSheet],
                },
            });

            const sheet = {
                id: "sheet-001",
                subjectId: "subject-001",
            } as Sheet;

            const result = await getRelatedSheets(sheet);

            expect(result).toEqual([]);
        });

        test("กรองชีทปัจจุบันและคืนชีทที่เกี่ยวข้องไม่เกิน 3 รายการ", async () => {
            const relatedData = [
                mockApiSheet,
                { ...mockApiSheet, id: "sheet-002", title: "ชีทที่ 2" },
                { ...mockApiSheet, id: "sheet-003", title: "ชีทที่ 3" },
                { ...mockApiSheet, id: "sheet-004", title: "ชีทที่ 4" },
                { ...mockApiSheet, id: "sheet-005", title: "ชีทที่ 5" },
            ];

            mockFetch({
                "/api/v1/sheets": {
                    data: relatedData,
                },
            });

            const sheet = {
                id: "sheet-001",
                subjectId: "subject-001",
            } as Sheet;

            const result = await getRelatedSheets(sheet);

            expect(result).toHaveLength(3);
            expect(result.map((item) => item.id)).toEqual([
                "sheet-002",
                "sheet-003",
                "sheet-004",
            ]);
            expect(result[0]).toMatchObject({
                title: "ชีทที่ 2",
                subjectName: mockApiSheet.subject?.name,
                thumbnailUrl: null,
                views: 10,
                likes: 5,
            });
        });
    });
});