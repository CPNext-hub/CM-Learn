import { describe, expect, test } from "vitest";
import { getSheetViewer } from "@/services/sheetViewerService";
import type { ApiSheet } from "@/services/sheetMappers";
import { mockFetch } from "../helpers/fetch";

const mockApiSheet: ApiSheet = {
    id: "sheet-001",
    title: "สรุปฟิสิกส์",
    description: "เนื้อหาวิชาฟิสิกส์",
    status: "published",
    viewCount: 10,
    likeCount: 5,
    dislikeCount: 1,
    commentCount: 2,
    owner: { id: "user-001", name: "Alice", image: null },
    subject: { id: "subject-001", name: "ฟิสิกส์" },
    category: { id: "category-001", name: "สรุปเนื้อหา" },
    file: { mimeType: "application/pdf", sizeBytes: 2048, versionNo: 1 },
    previewUrl: "/preview/file",
    downloadUrl: "/download/file",
    createdAt: "2026-11-20T00:00:00.000Z",
    updatedAt: "2026-11-20T00:00:00.000Z",
};

describe("sheetViewerService", () => {
    test("ดึงข้อมูลชีทและแปลงเป็นข้อมูลสำหรับหน้า Viewer", async () => {
        mockFetch({
            "/api/v1/sheets/sheet-001": { data: mockApiSheet },
        });

        const result = await getSheetViewer("sheet-001");

        expect(result).toEqual({
            id: "sheet-001",
            title: "สรุปฟิสิกส์",
            subjectName: "ฟิสิกส์",
            categoryName: "สรุปเนื้อหา",
            previewUrl: "/preview/file",
            downloadUrl: "/download/file",
            fileType: "PDF",
            isImage: false,
            creator: {
                id: "user-001",
                displayName: "Alice",
                avatarUrl: null,
            },
            viewCount: 10,
            likeCount: 5,
            commentCount: 2,
        });
    });

    test("ไฟล์รูปภาพต้องมี isImage เป็น true", async () => {
        mockFetch({
            "/api/v1/sheets/sheet-001": {
                data: {
                    ...mockApiSheet,
                    file: {
                        mimeType: "image/png",
                        sizeBytes: 1024,
                        versionNo: 1,
                    },
                },
            },
        });

        const result = await getSheetViewer("sheet-001");

        expect(result.isImage).toBe(true);
        expect(result.fileType).toBe("PNG");
    });

    test("ไม่มีไฟล์ต้องคืน fileType เป็นข้อความว่าง", async () => {
        mockFetch({
            "/api/v1/sheets/sheet-001": {
                data: {
                    ...mockApiSheet,
                    file: null,
                },
            },
        });

        const result = await getSheetViewer("sheet-001");

        expect(result.fileType).toBe("");
        expect(result.isImage).toBe(false);
    });

    test("API error ต้องโยน Error", async () => {
        mockFetch({
            "/api/v1/sheets/sheet-001": {
                status: 404,
                body: {
                    error: {
                        code: "NOT_FOUND",
                        message: "ไม่พบข้อมูลชีท",
                    },
                },
            },
        });

        await expect(getSheetViewer("sheet-001")).rejects.toThrow(
            "ไม่พบข้อมูลชีท"
        );
    });
});