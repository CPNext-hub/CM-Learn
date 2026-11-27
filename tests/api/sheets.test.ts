import { eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { GET as listSheets, POST as createSheet } from "@/app/api/v1/sheets/route";
import { sheetFiles, sheets } from "@/db/schema";
import * as storage from "@/lib/storage";
import { signUpUser, type TestUser } from "../helpers/auth";
import { cleanDbBeforeAll, lookups, testDb } from "../helpers/db";
import { fakePdfFile, pdfFile, sheetForm } from "../helpers/files";
import { json, request } from "../helpers/request";

cleanDbBeforeAll();

type SheetStatus = "draft" | "published" | "hidden";
type SheetOptions = { subjectId?: string | null; categoryId?: string | null; viewCount?: number; deletedAt?: Date | null };

let alice: TestUser;
beforeAll(async () => {
  alice = await signUpUser({ name: "FE2 Day 2 uploader" });
});

afterEach(() => vi.restoreAllMocks());

async function addSheet(title: string, status: SheetStatus, options: SheetOptions = {}) {
  const [row] = await testDb()
    .insert(sheets)
    .values({ ownerId: alice.id, title, status, ...options })
    .returning({ id: sheets.id });
  return row.id;
}

describe("GET /api/v1/sheets", () => {
  test("คืนเฉพาะชีทเผยแพร่ พร้อม pagination", async () => {
    await addSheet("Public A", "published");
    await addSheet("Public B", "published");
    await addSheet("Draft", "draft");
    await addSheet("Hidden", "hidden");
    await addSheet("Deleted", "published", { deletedAt: new Date() });

    const res = await listSheets(request("/api/v1/sheets?page=1&pageSize=1"));
    const body = await json(res);

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(["Public A", "Public B"]).toContain(body.data[0].title);
    expect(body.pagination).toMatchObject({ page: 1, pageSize: 1, total: 2, totalPages: 2 });
  });

  test("ค้นหาข้อความและกรอง subjectId กับ categoryId", async () => {
    const { subjects, categories } = await lookups();
    const subjectId = subjects[0].id;
    const categoryId = categories[0].id;
    await addSheet("Chemistry notes", "published", { subjectId, categoryId });
    await addSheet("Chemistry without category", "published", { subjectId });
    await addSheet("Physics notes", "published", { categoryId });

    const res = await listSheets(
      request(`/api/v1/sheets?q=%20chemistry%20&subjectId=${subjectId}&categoryId=${categoryId}`),
    );
    const body = await json(res);

    expect(res.status).toBe(200);
    expect(body.data.map((item: { title: string }) => item.title)).toEqual(["Chemistry notes"]);
  });

  test("filter ที่มี UUID ไม่ถูกต้อง → 400", async () => {
    for (const filter of ["subjectId", "categoryId"]) {
      const res = await listSheets(request(`/api/v1/sheets?${filter}=not-a-uuid`));
      expect(res.status).toBe(400);
      expect((await json(res)).error.code).toBe("VALIDATION_ERROR");
    }
  });

  test("sort popular และแบ่งหน้าตาม page/pageSize", async () => {
    await addSheet("Most viewed", "published", { viewCount: 20 });
    await addSheet("Second viewed", "published", { viewCount: 10 });
    await addSheet("Least viewed", "published", { viewCount: 1 });

    const res = await listSheets(request("/api/v1/sheets?sort=popular&page=2&pageSize=1"));
    const body = await json(res);

    expect(body.data).toHaveLength(1);
    expect(body.data[0].title).toBe("Second viewed");
    expect(body.pagination).toMatchObject({ page: 2, pageSize: 1, total: 3, totalPages: 3 });
  });
});

describe("POST /api/v1/sheets", () => {
  test("ไม่ล็อกอิน → 401", async () => {
    const res = await createSheet(request("/api/v1/sheets", { method: "POST", form: sheetForm({ title: "x", file: pdfFile() }) }));
    expect(res.status).toBe(401);
    expect((await json(res)).error.code).toBe("UNAUTHORIZED");
  });

  test("content type ไม่รองรับหรือไม่มี title → 400", async () => {
    const wrongType = await createSheet(
      request("/api/v1/sheets", {
        method: "POST",
        body: "x",
        cookie: alice.cookie,
        headers: { "Content-Type": "text/plain" },
      }),
    );
    expect(wrongType.status).toBe(400);

    const noTitle = await createSheet(
      request("/api/v1/sheets", { method: "POST", form: sheetForm({ file: pdfFile() }), cookie: alice.cookie }),
    );
    expect(noTitle.status).toBe(400);
    expect((await json(noTitle)).error.details.title).toBe("กรุณากรอกชื่อชีท");
  });

  test("เผยแพร่โดยไม่แนบไฟล์ → 400", async () => {
    const res = await createSheet(
      request("/api/v1/sheets", { method: "POST", form: sheetForm({ title: "No file" }), cookie: alice.cookie }),
    );
    expect(res.status).toBe(400);
    expect((await json(res)).error.details.file).toBe("กรุณาเลือกไฟล์");
  });

  test("บันทึกร่างโดยไม่แนบไฟล์ได้ → 201", async () => {
    const res = await createSheet(
      request("/api/v1/sheets", {
        method: "POST",
        form: sheetForm({ title: "Draft without file", status: "draft" }),
        cookie: alice.cookie,
      }),
    );
    const { data } = await json(res);

    expect(res.status).toBe(201);
    expect(data).toMatchObject({ title: "Draft without file", status: "draft", file: null, owner: { id: alice.id } });
  });

  test("อัปโหลด PDF สำเร็จและไม่เปิดเผย storageKey → 201", async () => {
    const { subjects, categories } = await lookups();
    const res = await createSheet(
      request("/api/v1/sheets", {
        method: "POST",
        form: sheetForm({ title: "Uploaded PDF", subjectId: subjects[0].id, categoryId: categories[0].id, file: pdfFile() }),
        cookie: alice.cookie,
      }),
    );
    const { data } = await json(res);
    const files = await testDb().select().from(sheetFiles).where(eq(sheetFiles.sheetId, data.id));

    expect(res.status).toBe(201);
    expect(data).toMatchObject({ title: "Uploaded PDF", file: { mimeType: "application/pdf", versionNo: 1 } });
    expect(data).not.toHaveProperty("file.storageKey");
    expect(files).toHaveLength(1);
    expect(files[0].storageKey).toContain(`sheets/${data.id}/`);
  });

  test("ปฏิเสธไฟล์ที่เนื้อหาไม่ใช่ PDF → 415", async () => {
    const res = await createSheet(
      request("/api/v1/sheets", {
        method: "POST",
        form: sheetForm({ title: "Fake PDF", file: fakePdfFile() }),
        cookie: alice.cookie,
      }),
    );
    expect(res.status).toBe(415);
    expect((await json(res)).error.code).toBe("UNSUPPORTED_FILE_TYPE");
  });

  test("ไฟล์ใหญ่เกินกำหนด → 413", async () => {
    const res = await createSheet(
      request("/api/v1/sheets", {
        method: "POST",
        body: "x",
        cookie: alice.cookie,
        headers: {
          "Content-Type": "multipart/form-data; boundary=unused",
          "Content-Length": String(51 * 1024 * 1024),
        },
      }),
    );
    expect(res.status).toBe(413);
    expect((await json(res)).error.code).toBe("FILE_TOO_LARGE");
  });

  test("transaction ล้มเหลวหลังบันทึกไฟล์ → คืน 500 และลบไฟล์ที่เพิ่งบันทึก", async () => {
    const transaction = vi.spyOn(testDb(), "transaction").mockRejectedValueOnce(new Error("simulated DB failure"));
    const deleteSpy = vi.spyOn(storage, "deleteFile");
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await createSheet(
      request("/api/v1/sheets", {
        method: "POST",
        form: sheetForm({ title: "Rollback upload", file: pdfFile() }),
        cookie: alice.cookie,
      }),
    );

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(deleteSpy).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(500);
    expect((await json(res)).error.code).toBe("INTERNAL_ERROR");
    expect(consoleSpy).toHaveBeenCalled();
  });
});
