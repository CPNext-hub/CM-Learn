import { describe, expect, test } from "vitest";
import { getDiscoverySheets } from "@/services/discoveryService";
import type { ApiSheet } from "@/services/sheetMappers";
import { mockFetch } from "../helpers/fetch";

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

const defaultParams = {
    filters: {
        subjectId: "",
        categoryId: "",
    },
    sort: "popular" as const,
    page: 1,
    limit: 10,
};

describe("getDiscoverySheets", () => {
    test("ดึงข้อมูลและแปลง Sheet ได้ถูกต้อง", async () => {
        mockFetch({
            "/api/v1/sheets?sort=popular&page=1&pageSize=10": {
                data: [mockSheet],
                pagination: {
                    page: 1,
                    pageSize: 10,
                    total: 25,
                    totalPages: 3,
                },
            },
        });

        const result = await getDiscoverySheets(defaultParams);

        expect(result).toEqual({
            items: [
                {
                    id: "sheet-001",
                    title: "Biology Notes",
                    description: "Biology study notes",
                    subjectName: "Biology",
                    categoryName: "Science",
                    coverImage: "/preview.png",
                    fileType: "PNG",
                    creator: {
                        id: "user-001",
                        name: "Test User",
                        avatar: "/avatar.png",
                    },
                    views: 100,
                    likes: 20,
                    createdAt: "2026-11-01T00:00:00.000Z",
                },
            ],
            total: 25,
            page: 1,
            limit: 10,
            totalPages: 3,
        });
    });

    test("ไม่มี Description และไม่มีไฟล์ต้องใช้ค่าเริ่มต้น", async () => {
        mockFetch({
            "/api/v1/sheets?sort=popular&page=1&pageSize=10": {
                data: [
                    {
                        ...mockSheet,
                        description: null,
                        file: null,
                    },
                ],
            },
        });

        const result = await getDiscoverySheets(defaultParams);

        expect(result.items[0].description).toBe("");
        expect(result.items[0].fileType).toBe("");
        expect(result.items[0].coverImage).toBeNull();
    });

    test("ไม่มี Subject และ Category ต้องใช้ค่าเริ่มต้น", async () => {
        mockFetch({
            "/api/v1/sheets?sort=popular&page=1&pageSize=10": {
                data: [
                    {
                        ...mockSheet,
                        subject: null,
                        category: null,
                    },
                ],
            },
        });

        const result = await getDiscoverySheets(defaultParams);

        expect(result.items[0].subjectName).toBeTruthy();
        expect(result.items[0].categoryName).toBeTruthy();
    });

    test("ค้นหาด้วย Keyword และตัดช่องว่างหัวท้าย", async () => {
        const fetchMock = mockFetch({
            "/api/v1/sheets?q=Biology&sort=popular&page=1&pageSize=10": {
                data: [mockSheet],
            },
        });

        const result = await getDiscoverySheets({
            ...defaultParams,
            keyword: "  Biology  ",
        });

        expect(result.items).toHaveLength(1);
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/v1/sheets?q=Biology&sort=popular&page=1&pageSize=10",
            undefined,
        );
    });

    test("Sort latest ต้องส่งค่า newest ไป API", async () => {
        const fetchMock = mockFetch({
            "/api/v1/sheets?sort=newest&page=1&pageSize=10": {
                data: [],
            },
        });

        await getDiscoverySheets({
            ...defaultParams,
            sort: "latest",
        });

        expect(fetchMock).toHaveBeenCalledWith(
            "/api/v1/sheets?sort=newest&page=1&pageSize=10",
            undefined,
        );
    });

    test("Sort popular ต้องส่งค่า popular ไป API", async () => {
        const fetchMock = mockFetch({
            "/api/v1/sheets?sort=popular&page=1&pageSize=10": {
                data: [],
            },
        });

        await getDiscoverySheets({
            ...defaultParams,
            sort: "popular",
        });

        expect(fetchMock).toHaveBeenCalledWith(
            "/api/v1/sheets?sort=popular&page=1&pageSize=10",
            undefined,
        );
    });

    test("กรองด้วย Subject และ Category ได้ถูกต้อง", async () => {
        const fetchMock = mockFetch({
            "/api/v1/sheets?subjectId=sub-001&categoryId=cat-001&sort=popular&page=1&pageSize=10": {
                data: [],
            },
        });

        await getDiscoverySheets({
            ...defaultParams,
            filters: {
                subjectId: "sub-001",
                categoryId: "cat-001",
            },
        });

        expect(fetchMock).toHaveBeenCalledWith(
            "/api/v1/sheets?subjectId=sub-001&categoryId=cat-001&sort=popular&page=1&pageSize=10",
            undefined,
        );
    });

    test("ไม่มี Pagination ต้องใช้ค่าเริ่มต้นจากข้อมูล", async () => {
        mockFetch({
            "/api/v1/sheets?sort=popular&page=2&pageSize=5": {
                data: [mockSheet, { ...mockSheet, id: "sheet-002" }],
            },
        });

        const result = await getDiscoverySheets({
            ...defaultParams,
            page: 2,
            limit: 5,
        });

        expect(result.total).toBe(2);
        expect(result.page).toBe(2);
        expect(result.limit).toBe(5);
        expect(result.totalPages).toBe(1);
    });

    test("API Error ต้อง throw Error", async () => {
        mockFetch({
            "/api/v1/sheets?sort=popular&page=1&pageSize=10": {
                status: 500,
                body: {
                    error: {
                        code: "SERVER_ERROR",
                        message: "Discovery failed",
                    },
                },
            },
        });

        await expect(
            getDiscoverySheets(defaultParams),
        ).rejects.toThrow("Discovery failed");
    });
});