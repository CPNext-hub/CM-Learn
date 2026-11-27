import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, test } from "vitest";
import { DELETE as deleteSheet, GET as getSheet, PATCH as updateSheet } from "@/app/api/v1/sheets/[id]/route";
import { sheetFiles, sheetReactions, sheets } from "@/db/schema";
import { signUpUser, type TestUser } from "../helpers/auth";
import { cleanDbBeforeAll, testDb } from "../helpers/db";
import { pdfFile, sheetForm } from "../helpers/files";
import { json, params, request } from "../helpers/request";

cleanDbBeforeAll();

let alice: TestUser;
let bob: TestUser;
beforeAll(async () => {
  alice = await signUpUser({ name: "FE2 Day 2 owner" });
  bob = await signUpUser({ name: "FE2 Day 2 viewer" });
});

async function addSheet(ownerId: string, title: string, status: "draft" | "published" | "hidden" = "published", viewCount = 0) {
  const [row] = await testDb()
    .insert(sheets)
    .values({ ownerId, title, status, viewCount })
    .returning({ id: sheets.id });
  return row.id;
}

async function addPdfVersion(sheetId: string, versionNo = 1) {
  await testDb().insert(sheetFiles).values({
    sheetId,
    versionNo,
    assetType: "original",
    storageKey: `sheets/${sheetId}/fixture-${versionNo}.pdf`,
    mimeType: "application/pdf",
    sizeBytes: 128,
  });
}

describe("GET /api/v1/sheets/:id", () => {
  test("id ไม่ใช่ UUID → 404", async () => {
    const res = await getSheet(request("/api/v1/sheets/not-a-uuid"), params({ id: "not-a-uuid" }));
    expect(res.status).toBe(404);
    expect((await json(res)).error.code).toBe("NOT_FOUND");
  });

  test("ชีทไม่มีอยู่หรือถูก soft delete → 404", async () => {
    const missingId = "11111111-1111-4111-8111-111111111111";
    const deletedId = await addSheet(alice.id, "Deleted sheet");
    await testDb().update(sheets).set({ deletedAt: new Date() }).where(eq(sheets.id, deletedId));

    for (const id of [missingId, deletedId]) {
      const res = await getSheet(request(`/api/v1/sheets/${id}`), params({ id }));
      expect(res.status).toBe(404);
    }
  });

  test("ผู้เยี่ยมชมและผู้ใช้ที่ล็อกอินดูชีทเผยแพร่ได้ พร้อม view count และ reaction", async () => {
    const id = await addSheet(alice.id, "Published sheet");
    await testDb().insert(sheetReactions).values({ userId: bob.id, sheetId: id, reaction: "like" });

    const guestRes = await getSheet(request(`/api/v1/sheets/${id}`), params({ id }));
    const guest = await json(guestRes);
    expect(guestRes.status).toBe(200);
    expect(guest.data.viewer).toEqual({ isOwner: false, reaction: null });
    expect(guest.data.viewCount).toBe(1);

    const viewerRes = await getSheet(request(`/api/v1/sheets/${id}`, { cookie: bob.cookie }), params({ id }));
    const viewer = await json(viewerRes);
    expect(viewer.data.viewer).toEqual({ isOwner: false, reaction: "like" });
    expect(viewer.data.viewCount).toBe(2);
  });

  test("เจ้าของดูชีทร่างได้โดยไม่เพิ่ม view count", async () => {
    const id = await addSheet(alice.id, "Owner draft", "draft", 4);
    const res = await getSheet(request(`/api/v1/sheets/${id}`, { cookie: alice.cookie }), params({ id }));
    const { data } = await json(res);

    expect(res.status).toBe(200);
    expect(data.viewer).toEqual({ isOwner: true, reaction: null });
    expect(data.viewCount).toBe(4);
  });

  test("ผู้ใช้คนอื่นดูชีทร่างหรือซ่อน → 404", async () => {
    for (const status of ["draft", "hidden"] as const) {
      const id = await addSheet(alice.id, `${status} private`, status);
      const res = await getSheet(request(`/api/v1/sheets/${id}`, { cookie: bob.cookie }), params({ id }));
      expect(res.status).toBe(404);
    }
  });
});

describe("PATCH /api/v1/sheets/:id", () => {
  test("ไม่มี session → 401", async () => {
    const id = await addSheet(alice.id, "Protected");
    const res = await updateSheet(request(`/api/v1/sheets/${id}`, { method: "PATCH", json: { title: "Changed" } }), params({ id }));
    expect(res.status).toBe(401);
  });

  test("id ผิดรูปแบบหรือไม่พบชีท → 404", async () => {
    const badId = "bad-id";
    const missingId = "22222222-2222-4222-8222-222222222222";
    for (const id of [badId, missingId]) {
      const res = await updateSheet(
        request(`/api/v1/sheets/${id}`, { method: "PATCH", json: { title: "Changed" }, cookie: alice.cookie }),
        params({ id }),
      );
      expect(res.status).toBe(404);
    }
  });

  test("ผู้ใช้คนอื่นแก้ชีทเผยแพร่ → 403", async () => {
    const id = await addSheet(alice.id, "Published by Alice");
    const res = await updateSheet(
      request(`/api/v1/sheets/${id}`, { method: "PATCH", json: { title: "Changed" }, cookie: bob.cookie }),
      params({ id }),
    );
    expect(res.status).toBe(403);
    expect((await json(res)).error.code).toBe("FORBIDDEN");
  });

  test("ผู้ใช้คนอื่นแก้ชีทร่างหรือซ่อน → 404", async () => {
    for (const status of ["draft", "hidden"] as const) {
      const id = await addSheet(alice.id, `${status} owned`, status);
      const res = await updateSheet(
        request(`/api/v1/sheets/${id}`, { method: "PATCH", json: { title: "Changed" }, cookie: bob.cookie }),
        params({ id }),
      );
      expect(res.status).toBe(404);
    }
  });

  test("ไม่มี field ให้แก้ → 400", async () => {
    const id = await addSheet(alice.id, "No-op sheet");
    const res = await updateSheet(
      request(`/api/v1/sheets/${id}`, { method: "PATCH", json: {}, cookie: alice.cookie }),
      params({ id }),
    );
    expect(res.status).toBe(400);
    expect((await json(res)).error.code).toBe("VALIDATION_ERROR");
  });

  test("เปลี่ยนร่างเป็นเผยแพร่โดยไม่มีไฟล์ → 400", async () => {
    const id = await addSheet(alice.id, "Draft to publish", "draft");
    const res = await updateSheet(
      request(`/api/v1/sheets/${id}`, { method: "PATCH", json: { status: "published" }, cookie: alice.cookie }),
      params({ id }),
    );
    expect(res.status).toBe(400);
    expect((await json(res)).error.details.file).toBe("กรุณาเลือกไฟล์");
  });

  test("เจ้าของแก้ metadata ด้วย JSON และล้าง description ได้ → 200", async () => {
    const id = await addSheet(alice.id, "Before edit", "published");
    await testDb().update(sheets).set({ description: "Old description" }).where(eq(sheets.id, id));
    const res = await updateSheet(
      request(`/api/v1/sheets/${id}`, {
        method: "PATCH",
        json: { title: "After edit", description: null, status: "hidden" },
        cookie: alice.cookie,
      }),
      params({ id }),
    );
    const { data } = await json(res);

    expect(res.status).toBe(200);
    expect(data).toMatchObject({ id, title: "After edit", description: null, status: "hidden" });
  });

  test("อัปโหลดไฟล์ใหม่ด้วย multipart → สร้าง version ถัดไป", async () => {
    const id = await addSheet(alice.id, "Versioned sheet");
    await addPdfVersion(id);
    const res = await updateSheet(
      request(`/api/v1/sheets/${id}`, {
        method: "PATCH",
        form: sheetForm({ file: pdfFile("new-version.pdf") }),
        cookie: alice.cookie,
      }),
      params({ id }),
    );
    const { data } = await json(res);
    const files = await testDb().select().from(sheetFiles).where(eq(sheetFiles.sheetId, id));

    expect(res.status).toBe(200);
    expect(data.file).toMatchObject({ mimeType: "application/pdf", versionNo: 2 });
    expect(files.map((file) => file.versionNo).sort()).toEqual([1, 2]);
  });
});

describe("DELETE /api/v1/sheets/:id", () => {
  test("ไม่มี session → 401", async () => {
    const id = await addSheet(alice.id, "Delete protected");
    const res = await deleteSheet(request(`/api/v1/sheets/${id}`, { method: "DELETE" }), params({ id }));
    expect(res.status).toBe(401);
  });

  test("ผู้ใช้คนอื่นลบชีทเผยแพร่ → 403", async () => {
    const id = await addSheet(alice.id, "Delete by owner only");
    const res = await deleteSheet(
      request(`/api/v1/sheets/${id}`, { method: "DELETE", cookie: bob.cookie }),
      params({ id }),
    );
    expect(res.status).toBe(403);
  });

  test("เจ้าของลบชีทแบบ soft delete; แถวอยู่ใน DB แต่ GET ตอบ 404", async () => {
    const id = await addSheet(alice.id, "Soft deleted sheet");
    const res = await deleteSheet(
      request(`/api/v1/sheets/${id}`, { method: "DELETE", cookie: alice.cookie }),
      params({ id }),
    );
    const { data } = await json(res);
    const [row] = await testDb().select().from(sheets).where(eq(sheets.id, id));
    const detail = await getSheet(request(`/api/v1/sheets/${id}`, { cookie: alice.cookie }), params({ id }));

    expect(res.status).toBe(200);
    expect(data).toEqual({ id, deleted: true });
    expect(row.deletedAt).toBeInstanceOf(Date);
    expect(detail.status).toBe(404);
  });
});
