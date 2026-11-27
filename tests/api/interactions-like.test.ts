import { beforeAll, describe, expect, test } from "vitest";
import {
    POST as postInteraction,
    DELETE as deleteInteraction,
} from "@/app/api/v1/[[...path]]/route";
import { POST as createSheet } from "@/app/api/v1/sheets/route";
import { signUpUser, type TestUser } from "../helpers/auth";
import { cleanDbBeforeAll, lookups, testDb } from "../helpers/db";
import { pdfFile, sheetForm } from "../helpers/files";
import { json, params, request } from "../helpers/request";
import { sql } from "drizzle-orm";

cleanDbBeforeAll();

let alice: TestUser;
let sheetId: string;

const reactionParams = (id: string) =>
    params({ path: ["sheets", id, "reactions"] });

describe("POST /api/v1/sheets/:id/reactions", () => {
    beforeAll(async () => {
        alice = await signUpUser({ name: "Alice" });

        const { subjects } = await lookups();

        const form = sheetForm({
            title: "ชีททดสอบ Reaction",
            subjectId: subjects[0].id,
            file: pdfFile(),
        });

        const res = await createSheet(
            request("/api/v1/sheets", {
                method: "POST",
                form,
                cookie: alice.cookie,
            }),
        );

        expect(res.status).toBe(201);

        const body = await json<{ data: { id: string } }>(res);
        sheetId = body.data.id;
    });

    test("ไม่เข้าสู่ระบบ → 401", async () => {
        const res = await postInteraction(
            request(`/api/v1/sheets/${sheetId}/reactions`, {
                method: "POST",
                json: { reaction: "like" },
            }),
            reactionParams(sheetId),
        );

        expect(res.status).toBe(401);
        expect((await json(res)).error.code).toBe("UNAUTHORIZED");
    });

    test("Sheet ID ไม่ถูกต้อง → 404", async () => {
        const res = await postInteraction(
            request("/api/v1/sheets/invalid-id/reactions", {
                method: "POST",
                json: { reaction: "like" },
                cookie: alice.cookie,
            }),
            reactionParams("invalid-id"),
        );

        expect(res.status).toBe(404);
        expect((await json(res)).error.code).toBe("NOT_FOUND");
    });

    test("ส่ง Reaction ที่ไม่ถูกต้อง → 400", async () => {
        const res = await postInteraction(
            request(`/api/v1/sheets/${sheetId}/reactions`, {
                method: "POST",
                json: { reaction: "love" },
                cookie: alice.cookie,
            }),
            reactionParams(sheetId),
        );

        expect(res.status).toBe(400);
        expect((await json(res)).error.code).toBe("VALIDATION_ERROR");
    });

    test("กด Like → เปลี่ยนเป็น Dislike → ยกเลิก Reaction", async () => {
        // กด Like
        const likeRes = await postInteraction(
            request(`/api/v1/sheets/${sheetId}/reactions`, {
                method: "POST",
                json: { reaction: "like" },
                cookie: alice.cookie,
            }),
            reactionParams(sheetId),
        );

        expect(likeRes.status).toBe(200);

        const likeData = (await json(likeRes)).data;
        expect(likeData).toMatchObject({
            reaction: "like",
            likes: 1,
            dislikes: 0,
        });

        // เปลี่ยนจาก Like เป็น Dislike
        const dislikeRes = await postInteraction(
            request(`/api/v1/sheets/${sheetId}/reactions`, {
                method: "POST",
                json: { reaction: "dislike" },
                cookie: alice.cookie,
            }),
            reactionParams(sheetId),
        );

        expect(dislikeRes.status).toBe(200);

        const dislikeData = (await json(dislikeRes)).data;
        expect(dislikeData).toMatchObject({
            reaction: "dislike",
            likes: 0,
            dislikes: 1,
        });

        // ตรวจสอบข้อมูลจริงในฐานข้อมูล
        const rows = await testDb().execute(sql`
    SELECT reaction
    FROM sheet_reactions
    WHERE user_id = ${alice.id}
    AND sheet_id = ${sheetId}
`);

        expect(rows).toHaveLength(1);
        expect(rows[0].reaction).toBe("dislike");

        // ยกเลิก Reaction
        const deleteRes = await deleteInteraction(
            request(`/api/v1/sheets/${sheetId}/reactions`, {
                method: "DELETE",
                cookie: alice.cookie,
            }),
            reactionParams(sheetId),
        );

        expect(deleteRes.status).toBe(200);
        expect((await json(deleteRes)).data).toEqual({ removed: true });
        // ตรวจสอบว่า Reaction ถูกลบออกจากฐานข้อมูลแล้ว
        const remainingRows = await testDb().execute(sql`
    SELECT reaction
    FROM sheet_reactions
    WHERE user_id = ${alice.id}
    AND sheet_id = ${sheetId}
`);

        expect(remainingRows).toHaveLength(0);
    });

    test("Sheet ไม่มีอยู่ในระบบ → 404", async () => {
        const missingSheetId = "00000000-0000-4000-8000-000000000000";

        const res = await postInteraction(
            request(`/api/v1/sheets/${missingSheetId}/reactions`, {
                method: "POST",
                json: { reaction: "like" },
                cookie: alice.cookie,
            }),
            reactionParams(missingSheetId),
        );

        expect(res.status).toBe(404);
        expect((await json(res)).error.code).toBe("NOT_FOUND");
    });
});