import { beforeAll, describe, expect, test } from "vitest";
import { GET } from "@/app/api/v1/categories/route";
import { cleanDbBeforeAll, lookups } from "../../../../helpers/db";
import { json } from "../../../../helpers/request";

cleanDbBeforeAll();

describe("GET /api/v1/categories", () => {
    let expectedCategories: { id: string; name: string }[];

    beforeAll(async () => {
        const result = await lookups();

        expectedCategories = result.categories.map(({ id, name }) => ({
            id,
            name,
        }));
    });

    test("ดึงหมวดหมู่สำเร็จ ต้องได้ HTTP 200", async () => {
        const res = await GET();

        expect(res.status).toBe(200);
    });

    test("ต้องส่งข้อมูลหมวดหมู่ในรูปแบบ id และ name", async () => {
        const res = await GET();
        const body = await json(res);

        expect(body.data).toEqual(expectedCategories);
    });

    test("หมวดหมู่ต้องเรียงตามชื่อจากน้อยไปมาก", async () => {
        const res = await GET();
        const body = await json(res);

        const names = body.data.map(
            (category: { name: string }) => category.name,
        );

        expect(names).toEqual(
            expectedCategories.map((category) => category.name),
        );
    });
});