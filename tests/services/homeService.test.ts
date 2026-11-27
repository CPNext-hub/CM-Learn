import { describe, expect, test } from "vitest";
import {
    toHomeSheet,
    getHomePageData,
    searchHomeSheets,
} from "@/services/homeService";
import type { ApiSheet } from "@/services/sheetMappers";
import { mockFetch } from "../helpers/fetch";

// ข้อมูลจำลองจาก API
const mockSheet: ApiSheet = {
    id: "sheet-001",
    title: "Biology Notes",
    description: "Biology study notes",
    status: "published",
    viewCount: 100,
    likeCount: 20,
    dislikeCount: 2,
    commentCount: 5,
    owner: {
        id: "user-001",
        name: "Test User",
        image: "/avatar.png",
    },
    subject: {
        id: "subject-001",
        name: "Biology",
    },
    category: {
        id: "category-001",
        name: "Science",
    },
    file: {
        mimeType: "image/png",
        sizeBytes: 1024,
        versionNo: 1,
    },
    previewUrl: "/preview.png",
    downloadUrl: "/download.png",
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-20T00:00:00.000Z",
};

describe("toHomeSheet", () => {
    test("แปลงข้อมูล Sheet ได้ถูกต้อง", () => {
        const result = toHomeSheet(mockSheet);

        expect(result).toMatchObject({
            id: "sheet-001",
            title: "Biology Notes",
            subjectName: "Biology",
            category: "Science",
            thumbnailUrl: "/preview.png",
            author: {
                id: "user-001",
                name: "Test User",
                avatarUrl: "/avatar.png",
            },
            views: 100,
            likes: 20,
            fileType: "PNG",
        });
    });

    test("ไม่มีไฟล์แนบต้องคืน fileType เป็นข้อความว่าง", () => {
        const result = toHomeSheet({
            ...mockSheet,
            file: null,
        });

        expect(result.fileType).toBe("");
        expect(result.thumbnailUrl).toBeNull();
    });

    test("ไฟล์ที่ไม่ใช่รูปภาพต้องไม่มี thumbnailUrl", () => {
        const result = toHomeSheet({
            ...mockSheet,
            file: {
                mimeType: "application/pdf",
                sizeBytes: 1024,
                versionNo: 1,
            },
        });

        expect(result.fileType).toBe("PDF");
        expect(result.thumbnailUrl).toBeNull();
    });

    test("ไม่มี Subject และ Category ต้องใช้ค่าเริ่มต้น", () => {
        const result = toHomeSheet({
            ...mockSheet,
            subject: null,
            category: null,
        });

        expect(result.subjectName).toBeTruthy();
        expect(result.category).toBeTruthy();
    });
});

describe("getHomePageData", () => {
    test("ดึงข้อมูลหน้า Home และคำนวณสถิติได้ถูกต้อง", async () => {
        mockFetch({
            "/api/v1/sheets?sort=popular&pageSize=4": {
                data: [mockSheet],
            },
            "/api/v1/sheets?sort=newest&pageSize=6": {
                data: [mockSheet],
                pagination: { page: 1, pageSize: 6, total: 50, totalPages: 9 },
            },
            "/api/v1/subjects": {
                data: [
                    { id: "subject-001", name: "Biology" },
                    { id: "subject-002", name: "Physics" },
                ],
            },
            "/api/v1/categories": {
                data: [
                    { id: "category-001", name: "Science" },
                    { id: "category-002", name: "Math" },
                ],
            },
            "/api/v1/sheets?categoryId=category-001&pageSize=1": {
                data: [mockSheet],
                pagination: { page: 1, pageSize: 1, total: 10, totalPages: 10 },
            },
            "/api/v1/sheets?categoryId=category-002&pageSize=1": {
                data: [],
                pagination: { page: 1, pageSize: 1, total: 0, totalPages: 0 },
            },
        });

        const result = await getHomePageData();

        expect(result.stats).toEqual({
            totalSheets: 50,
            totalSubjects: 2,
            totalCategories: 2,
        });

        expect(result.categories).toHaveLength(2);
        expect(result.categories[0].sheetCount).toBe(10);
        expect(result.categories[1].sheetCount).toBe(0);

        expect(result.popularSheets).toHaveLength(1);
        expect(result.latestSheets).toHaveLength(1);
        expect(result.popularSheets[0].title).toBe("Biology Notes");
    });

    test("ไม่มี pagination ต้องใช้จำนวนข้อมูลเป็น totalSheets และจำนวน Sheet ของ Category เป็น 0", async () => {
        mockFetch({
            "/api/v1/sheets?sort=popular&pageSize=4": {
                data: [],
            },
            "/api/v1/sheets?sort=newest&pageSize=6": {
                data: [mockSheet, { ...mockSheet, id: "sheet-002" }],
            },
            "/api/v1/subjects": {
                data: [],
            },
            "/api/v1/categories": {
                data: [
                    { id: "category-001", name: "Science" },
                ],
            },
            "/api/v1/sheets?categoryId=category-001&pageSize=1": {
                data: [],
            },
        });

        const result = await getHomePageData();

        expect(result.stats.totalSheets).toBe(2);
        expect(result.stats.totalSubjects).toBe(0);
        expect(result.categories[0].sheetCount).toBe(0);
    });

    test("API Error ต้อง throw Error", async () => {
        mockFetch({
            "/api/v1/sheets?sort=popular&pageSize=4": {
                data: [],
            },
            "/api/v1/sheets?sort=newest&pageSize=6": {
                data: [],
            },
            "/api/v1/subjects": {
                status: 500,
                body: {
                    error: {
                        code: "SERVER_ERROR",
                        message: "Server Error",
                    },
                },
            },
            "/api/v1/categories": {
                data: [],
            },
        });

        await expect(getHomePageData()).rejects.toThrow("Server Error");
    });
});

describe("searchHomeSheets", () => {
    test("ค้นหา Sheet และตัดช่องว่างของคำค้นหา", async () => {
        const fetchMock = mockFetch({
            "/api/v1/sheets?q=Biology+Notes&categoryId=category-001&sort=popular&page=1&pageSize=5": {
                data: [mockSheet],
            },
        });

        const result = await searchHomeSheets({
            search: "  Biology Notes  ",
            categoryId: "category-001",
            sort: "popular",
            page: 1,
            limit: 5,
        });

        expect(result).toHaveLength(1);
        expect(result[0].title).toBe("Biology Notes");

        expect(fetchMock).toHaveBeenCalledWith(
            "/api/v1/sheets?q=Biology+Notes&categoryId=category-001&sort=popular&page=1&pageSize=5",
            undefined,
        );
    });

    test("ไม่มีผลการค้นหาต้องคืน Array ว่าง", async () => {
        mockFetch({
            "/api/v1/sheets?": {
                data: [],
            },
        });

        const result = await searchHomeSheets({});

        expect(result).toEqual([]);
    });

    test("API Error ต้อง throw Error", async () => {
        mockFetch({
            "/api/v1/sheets?": {
                status: 500,
                body: {
                    error: {
                        code: "SERVER_ERROR",
                        message: "Search failed",
                    },
                },
            },
        });

        await expect(searchHomeSheets({})).rejects.toThrow("Search failed");
    });
});