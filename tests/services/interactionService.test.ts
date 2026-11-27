import { describe, expect, test } from "vitest";
import {
    getComments,
    countComments,
    addComment,
    replyToComment,
    deleteComment,
    toggleReaction,
    getSavedSheets,
    getFavoriteIds,
    setFavorite,
} from "@/services/interactionService";
import { mockFetch } from "../helpers/fetch";

const comment = {
    id: "comment-001",
    authorId: "user-001",
    authorName: "Test User",
    authorImage: "/avatar.png",
    body: "This is a comment",
    deleted: false,
    createdAt: "2026-11-01T00:00:00.000Z",
};

const sheet = {
    id: "sheet-001",
    title: "Biology Notes",
    description: "Study notes",
    status: "published",
    viewCount: 100,
    likeCount: 20,
    dislikeCount: 2,
    commentCount: 1,
    owner: { id: "user-001", name: "Test User", image: null },
    subject: null,
    category: null,
    file: null,
    previewUrl: null,
    downloadUrl: null,
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-20T00:00:00.000Z",
    favoritedAt: "2026-11-25T00:00:00.000Z",
};

describe("interactionService", () => {
    describe("getComments", () => {
        test("ดึงความคิดเห็นและ Replies ได้ถูกต้อง", async () => {
            mockFetch({
                "/api/v1/sheets/sheet-001/comments": {
                    data: [
                        {
                            ...comment,
                            replies: [{ ...comment, id: "reply-001" }],
                        },
                    ],
                },
            });

            const result = await getComments("sheet-001");

            expect(result).toHaveLength(1);
            expect(result[0].id).toBe("comment-001");
            expect(result[0].replies[0].id).toBe("reply-001");
        });

        test("ไม่มี Replies ต้องใช้ Array ว่าง", async () => {
            mockFetch({
                "/api/v1/sheets/sheet-001/comments": {
                    data: [comment],
                },
            });

            const result = await getComments("sheet-001");

            expect(result[0].replies).toEqual([]);
        });

        test("เข้ารหัส Sheet ID ใน URL", async () => {
            mockFetch({
                "/api/v1/sheets/sheet%2F001/comments": { data: [] },
            });

            const result = await getComments("sheet/001");

            expect(result).toEqual([]);
        });

        test("API Error ต้องแสดงข้อความภาษาไทย", async () => {
            mockFetch({
                "/api/v1/sheets/sheet-001/comments": {
                    status: 404,
                    body: { error: { code: "NOT_FOUND", message: "Sheet not found." } },
                },
            });

            await expect(getComments("sheet-001")).rejects.toThrow(
                "ไม่พบชีทนี้ หรือชีทถูกลบไปแล้ว",
            );
        });
        test("Network Error ต้องแสดงข้อความจากระบบ", async () => {
            mockFetch({
                "/api/v1/sheets/sheet-001/comments": new Error("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้"),
            });

            await expect(getComments("sheet-001")).rejects.toThrow(
                "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้",
            );
        });

        test("API Error 401 ต้องแจ้งให้เข้าสู่ระบบ", async () => {
            mockFetch({
                "/api/v1/sheets/sheet-001/comments": {
                    status: 401,
                    body: {
                        error: {
                            code: "UNAUTHORIZED",
                            message: "Unauthorized",
                        },
                    },
                },
            });

            await expect(getComments("sheet-001")).rejects.toThrow(
                "กรุณาเข้าสู่ระบบก่อน",
            );
        });

        test("API Error 404 ที่ไม่มีข้อความเฉพาะต้องแจ้งว่าไม่พบข้อมูล", async () => {
            mockFetch({
                "/api/v1/sheets/sheet-001/comments": {
                    status: 404,
                    body: {
                        error: {
                            code: "NOT_FOUND",
                            message: "Unknown error",
                        },
                    },
                },
            });

            await expect(getComments("sheet-001")).rejects.toThrow(
                "ไม่พบข้อมูล หรือถูกลบไปแล้ว",
            );
        });
    });

    describe("countComments", () => {
        test("นับเฉพาะความคิดเห็นและ Replies ที่ไม่ถูกลบ", () => {
            const comments = [
                {
                    ...comment,
                    replies: [
                        { ...comment, id: "reply-1", deleted: false, replies: [] },
                        { ...comment, id: "reply-2", deleted: true, replies: [] },
                    ],
                },
                {
                    ...comment,
                    id: "comment-2",
                    deleted: true,
                    replies: [
                        { ...comment, id: "reply-3", deleted: false, replies: [] },
                    ],
                },
            ];

            expect(countComments(comments)).toBe(3);
        });

        test("ไม่มีความคิดเห็นต้องได้ศูนย์", () => {
            expect(countComments([])).toBe(0);
        });
    });

    describe("addComment", () => {
        test("ส่งความคิดเห็นด้วย POST", async () => {
            const fetchMock = mockFetch({
                "/api/v1/sheets/sheet-001/comments": { data: {} },
            });

            await addComment("sheet-001", "Hello");

            expect(fetchMock).toHaveBeenCalledOnce();
            expect(fetchMock.mock.calls[0][1]?.method).toBe("POST");
        });

        test("Sheet ID ที่มีอักขระพิเศษต้องถูกเข้ารหัส", async () => {
            const fetchMock = mockFetch({
                "/api/v1/sheets/sheet%2F001/comments": { data: {} },
            });

            await addComment("sheet/001", "Hello");

            expect(fetchMock).toHaveBeenCalledOnce();
        });
    });

    describe("replyToComment", () => {
        test("ส่งข้อความตอบกลับด้วย POST", async () => {
            const fetchMock = mockFetch({
                "/api/v1/comments/comment-001/replies": { data: {} },
            });

            await replyToComment("comment-001", "Reply");

            expect(fetchMock.mock.calls[0][1]?.method).toBe("POST");
        });
    });

    describe("deleteComment", () => {
        test("ลบความคิดเห็นด้วย DELETE", async () => {
            const fetchMock = mockFetch({
                "/api/v1/comments/comment-001": { data: {} },
            });

            await deleteComment("comment-001");

            expect(fetchMock.mock.calls[0][1]?.method).toBe("DELETE");
        });

        test("Comment ID ที่มีอักขระพิเศษต้องถูกเข้ารหัส", async () => {
            const fetchMock = mockFetch({
                "/api/v1/comments/comment%2F001": { data: {} },
            });

            await deleteComment("comment/001");

            expect(fetchMock).toHaveBeenCalledOnce();
        });
    });

    describe("toggleReaction", () => {
        test("กด Like ใหม่ต้องส่ง POST และใช้ Counts จาก API", async () => {
            mockFetch({
                "/api/v1/sheets/sheet-001/reactions": {
                    data: { likes: 21, dislikes: 2 },
                },
            });

            const result = await toggleReaction(
                "sheet-001",
                "like",
                { likes: 20, dislikes: 2, mine: null },
            );

            expect(result).toEqual({
                likes: 21,
                dislikes: 2,
                mine: "like",
            });
        });

        test("กด Like ซ้ำต้องยกเลิก Like ด้วย DELETE", async () => {
            const fetchMock = mockFetch({
                "/api/v1/sheets/sheet-001/reactions": { data: {} },
            });

            const result = await toggleReaction(
                "sheet-001",
                "like",
                { likes: 20, dislikes: 2, mine: "like" },
            );

            expect(result).toEqual({
                likes: 19,
                dislikes: 2,
                mine: null,
            });
            expect(fetchMock.mock.calls[0][1]?.method).toBe("DELETE");
        });

        test("กด Dislike ซ้ำต้องลด Dislike ลงหนึ่ง", async () => {
            const fetchMock = mockFetch({
                "/api/v1/sheets/sheet-001/reactions": { data: {} },
            });

            const result = await toggleReaction(
                "sheet-001",
                "dislike",
                { likes: 20, dislikes: 3, mine: "dislike" },
            );

            expect(result).toEqual({
                likes: 20,
                dislikes: 2,
                mine: null,
            });

            expect(fetchMock.mock.calls[0][1]?.method).toBe("DELETE");
        });

        test("เปลี่ยนจาก Like เป็น Dislike ต้องใช้ Counts จาก API", async () => {
            mockFetch({
                "/api/v1/sheets/sheet-001/reactions": {
                    data: { likes: 19, dislikes: 3 },
                },
            });

            const result = await toggleReaction(
                "sheet-001",
                "dislike",
                { likes: 20, dislikes: 2, mine: "like" },
            );

            expect(result).toEqual({
                likes: 19,
                dislikes: 3,
                mine: "dislike",
            });
        });
    });

    describe("getSavedSheets", () => {
        test("ดึงรายการชีทที่บันทึกไว้", async () => {
            mockFetch({
                "/api/v1/favorites": { data: [sheet] },
            });

            const result = await getSavedSheets();

            expect(result).toHaveLength(1);
            expect(result?.[0].favoritedAt).toBe(sheet.favoritedAt);
        });

        test("Guest ที่ได้ 401 ต้องคืนค่า null", async () => {
            mockFetch({
                "/api/v1/favorites": {
                    status: 401,
                    body: {
                        error: {
                            code: "UNAUTHORIZED",
                            message: "Authentication required.",
                        },
                    },
                },
            });

            expect(await getSavedSheets()).toBeNull();
        });

        test("API Error 500 ต้องแสดงข้อความระบบขัดข้อง", async () => {
            mockFetch({
                "/api/v1/favorites": {
                    status: 500,
                    body: { error: { code: "SERVER_ERROR", message: "Server error" } },
                },
            });

            await expect(getSavedSheets()).rejects.toThrow(
                "ระบบขัดข้อง กรุณาลองอีกครั้ง",
            );
        });

        test("API Error 400 ต้องแสดงข้อความผิดพลาดทั่วไป", async () => {
            mockFetch({
                "/api/v1/favorites": {
                    status: 400,
                    body: {
                        error: {
                            code: "BAD_REQUEST",
                            message: "Unexpected error",
                        },
                    },
                },
            });

            await expect(getSavedSheets()).rejects.toThrow(
                "ทำรายการไม่สำเร็จ กรุณาลองอีกครั้ง",
            );
        });
    });

    describe("getFavoriteIds", () => {
        test("คืนค่า Set ของ Favorite IDs", async () => {
            mockFetch({
                "/api/v1/favorites": { data: [sheet] },
            });

            const result = await getFavoriteIds();

            expect(result).toEqual(new Set(["sheet-001"]));
        });

        test("Guest ต้องได้ Set ว่าง", async () => {
            mockFetch({
                "/api/v1/favorites": {
                    status: 401,
                    body: { error: { code: "UNAUTHORIZED", message: "Unauthorized" } },
                },
            });

            expect(await getFavoriteIds()).toEqual(new Set());
        });
    });

    describe("setFavorite", () => {
        test("บันทึก Favorite ด้วย POST", async () => {
            const fetchMock = mockFetch({
                "/api/v1/favorites/sheet-001": { data: {} },
            });

            await setFavorite("sheet-001", true);

            expect(fetchMock.mock.calls[0][1]?.method).toBe("POST");
        });

        test("ยกเลิก Favorite ด้วย DELETE", async () => {
            const fetchMock = mockFetch({
                "/api/v1/favorites/sheet-001": { data: {} },
            });

            await setFavorite("sheet-001", false);

            expect(fetchMock.mock.calls[0][1]?.method).toBe("DELETE");
        });

        test("Sheet ID ที่มีอักขระพิเศษต้องถูกเข้ารหัส", async () => {
            const fetchMock = mockFetch({
                "/api/v1/favorites/sheet%2F001": { data: {} },
            });

            await setFavorite("sheet/001", true);

            expect(fetchMock).toHaveBeenCalledOnce();
        });
    });
});