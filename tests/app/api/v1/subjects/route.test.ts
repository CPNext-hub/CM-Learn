import { beforeAll, describe, expect, test } from "vitest";
import { GET } from "@/app/api/v1/subjects/route";
import { cleanDbBeforeAll, lookups } from "../../../../helpers/db";
import { json } from "../../../../helpers/request";

cleanDbBeforeAll();

describe("GET /api/v1/subjects", () => {
    let expectedSubjects: { id: string; name: string }[];

    beforeAll(async () => {
        const result = await lookups();

        expectedSubjects = result.subjects.map(({ id, name }) => ({
            id,
            name,
        }));
    });

    test("ดึงรายวิชาสำเร็จ ต้องได้ HTTP 200", async () => {
        const res = await GET();

        expect(res.status).toBe(200);
    });

    test("ต้องส่งข้อมูลรายวิชาในรูปแบบ id และ name", async () => {
        const res = await GET();
        const body = await json(res);

        expect(body.data).toEqual(expectedSubjects);
    });

    test("รายวิชาต้องเรียงตามชื่อจากน้อยไปมาก", async () => {
        const res = await GET();
        const body = await json(res);

        const names = body.data.map(
            (subject: { name: string }) => subject.name,
        );

        expect(names).toEqual(expectedSubjects.map((subject) => subject.name));
    });
});