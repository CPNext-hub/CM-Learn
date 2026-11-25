# Unit Test — คู่มือทีม CM Learn

เป้าหมาย: **Line coverage ≥ 95%** ของโค้ด logic (`src/lib`, `src/services`, `src/app/api`, `src/db/client.ts`, `src/db/schema.ts`)
ทดสอบกับ **PostgreSQL จริง** ใน DB แยกชื่อ `cmlearn_test` · เครื่องมือ: **Vitest**

แผนงานและการแบ่งไฟล์: `output/pdf/CM-Learn-Unit-Test-Plan.pdf` และ `output/xlsx/CM-Learn-Unit-Test-Plan.xlsx`

---

## 1. เริ่มใน 5 นาที

ต้องมี: PostgreSQL ในเครื่อง, ไฟล์ `.env` ที่ `DATABASE_URL` ใช้ได้ (ตัวเดียวกับที่ใช้รัน `npm.cmd run dev`)

```powershell
git pull
npm.cmd install
npm.cmd test
```

ถ้าเห็น `Test Files  5 passed` แปลว่าพร้อมแล้ว — ไม่ต้องสร้าง DB เอง ระบบสร้าง `cmlearn_test` และรัน migration ให้อัตโนมัติ

| คำสั่ง | ใช้ตอนไหน |
|---|---|
| `npm.cmd test` | รัน test ทั้งหมดหนึ่งรอบ |
| `npm.cmd run test:watch` | ระหว่างเขียน test — รันใหม่เองทุกครั้งที่บันทึกไฟล์ |
| `npm.cmd run test:coverage` | ดู % coverage · ต่ำกว่า 95% จะขึ้น `ERROR ... threshold` (ปกติจนกว่าทีมจะเขียนครบ) |
| `npx.cmd vitest run tests/lib/storage.test.ts` | รันเฉพาะไฟล์เดียว |
| `npx.cmd vitest run -t "ไฟล์ปลอม"` | รันเฉพาะ test ที่ชื่อมีคำนี้ |

**ดูบรรทัดที่ยังไม่ถูก test:** หลัง `test:coverage` เปิด `coverage/index.html` ในเบราว์เซอร์ → คลิกไฟล์ → บรรทัด **สีแดง** = ยังไม่มี test วิ่งผ่าน
ตัวเลขที่ต้องกรอกใน Excel คือคอลัมน์ **% Lines** ของไฟล์นั้น

---

## 2. โครงสร้างโฟลเดอร์

```
tests/
  README.md               ← ไฟล์นี้
  setup/                  ← ระบบ (ไม่ต้องแก้)
    test-env.ts             ตั้ง DATABASE_URL → cmlearn_test, โฟลเดอร์อัปโหลดชั่วคราว, ค่า auth
    global-setup.ts         สร้าง DB + migrate ครั้งเดียวก่อนเริ่ม
    per-file.ts             รันก่อนทุกไฟล์ test, ปิด connection หลังจบ
  helpers/                ← เครื่องมือที่ทุกคนใช้
    db.ts                   cleanDbBeforeAll, resetDb, testDb, lookups
    auth.ts                 signUpUser, signUpAdmin
    request.ts              request, params, json
    files.ts                pdfFile, pngFile, docxFile, fakePdfFile, bigPdfFile, sheetForm, zipBytes …
    fetch.ts                mockFetch (สำหรับ services / api-client)
  examples/               ← ตัวอย่าง 3 แบบ อ่านก่อนเริ่มเขียน
    01-pure-function.test.ts
    02-route-with-db.test.ts
    03-service-mock-fetch.test.ts
  lib/  services/  api/   ← test ของแต่ละคน (ตามโครงสร้าง src)
```

**ตั้งชื่อไฟล์ test ตามไฟล์ที่ทดสอบ:**

| ไฟล์ที่ทดสอบ | ไฟล์ test |
|---|---|
| `src/lib/storage.ts` | `tests/lib/storage.test.ts` |
| `src/services/homeService.ts` | `tests/services/homeService.test.ts` |
| `src/app/api/v1/sheets/[id]/route.ts` | `tests/api/sheets-id.test.ts` |
| `src/app/api/v1/[[...path]]/route.ts` | `tests/api/interactions.test.ts` (แยกหลายไฟล์ได้ เช่น `interactions-comments.test.ts`) |

แต่ละคนแก้เฉพาะไฟล์ test ของตัวเอง → ไม่ชนกันตอน merge

---

## 3. เขียน test แบบไหน — เลือกตามไฟล์ที่ได้รับ

| ไฟล์ของคุณ | ใช้แบบ | ดูตัวอย่าง |
|---|---|---|
| ฟังก์ชันที่รับค่าแล้วคืนค่า (`sheetMappers`, ส่วนตรวจไฟล์ใน `storage`, `sizeLabel`, `parsePagination` …) | 1. ฟังก์ชันล้วน | `examples/01-pure-function.test.ts` |
| API route (`src/app/api/**`) และ lib ที่คุยกับ DB (`sheets.ts`, `users.ts` …) | 2. route + DB จริง | `examples/02-route-with-db.test.ts` |
| โค้ดฝั่งหน้าเว็บที่เรียก `fetch()` (`src/services/**`, `api-client.ts`) | 3. mock fetch | `examples/03-service-mock-fetch.test.ts` |

### รูปแบบพื้นฐานของทุก test

```ts
import { describe, expect, test } from "vitest";

describe("ชื่อฟังก์ชัน / route", () => {
  test("สถานการณ์ → ผลที่คาดหวัง", async () => {
    // 1. เตรียมข้อมูล
    // 2. เรียกโค้ดที่ทดสอบ
    // 3. ตรวจผล
    expect(ผลจริง).toBe(ผลที่คาดหวัง);
  });
});
```

`expect` ที่ใช้บ่อย:

| ต้องการตรวจ | เขียน |
|---|---|
| เท่ากัน (ตัวเลข, ข้อความ, true/false) | `expect(x).toBe(3)` |
| object / array เท่ากันทุกช่อง | `expect(x).toEqual({ page: 1 })` |
| object มีบางช่องตามนี้ (ช่องอื่นไม่สน) | `expect(x).toMatchObject({ title: "A" })` |
| array ยาวเท่านี้ | `expect(list).toHaveLength(2)` |
| โยน error | `expect(() => fn()).toThrow("ข้อความ")` |
| async แล้ว error | `await expect(fn()).rejects.toThrow("ข้อความ")` |
| ไม่มีค่า | `expect(x).toBeUndefined()` / `toBeNull()` |

---

## 4. Helper — ใช้ยังไง

### DB (`helpers/db.ts`)

```ts
import { cleanDbBeforeAll, lookups, testDb } from "../helpers/db";

cleanDbBeforeAll();                 // บรรทัดแรกของไฟล์ที่ใช้ DB: เริ่มด้วยตารางว่าง (วิชา/หมวดหมู่ seed ยังอยู่)

const { subjects, categories } = await lookups();   // วิชา 9 + หมวดหมู่ 5 ที่ seed ไว้
const rows = await testDb().select().from(sheets);  // อ่าน DB ตรง ๆ เพื่อตรวจว่าบันทึกจริง
```

ข้อมูลจะถูกล้าง**ครั้งเดียวตอนเริ่มไฟล์** — test ในไฟล์เดียวกันเห็นข้อมูลของกันและกัน
ถ้า test ไหนต้องเริ่มจากว่างจริง ๆ ให้เรียก `await resetDb()` เอง

### ผู้ใช้ + ล็อกอิน (`helpers/auth.ts`)

```ts
import { signUpUser, signUpAdmin } from "../helpers/auth";

const alice = await signUpUser();                  // อีเมลสุ่ม, รหัส password1234
const bob = await signUpUser({ name: "Bob" });
const admin = await signUpAdmin();                 // role = admin
// alice.id, alice.email, alice.cookie
```

สมัครผ่าน route จริงของ Better Auth (ทางเดียวกับหน้าเว็บ) จึงได้ cookie ที่ใช้ได้จริง

### เรียก route (`helpers/request.ts`)

```ts
import { GET, PATCH } from "@/app/api/v1/sheets/[id]/route";
import { json, params, request } from "../helpers/request";

// ไม่ล็อกอิน
const res = await GET(request(`/api/v1/sheets/${id}`), params({ id }));

// ล็อกอินเป็น alice + ส่ง JSON
const res2 = await PATCH(
  request(`/api/v1/sheets/${id}`, { method: "PATCH", json: { title: "ใหม่" }, cookie: alice.cookie }),
  params({ id }),
);

expect(res2.status).toBe(200);
const body = await json(res2);       // { data } หรือ { error: { code, message, details } }
expect(body.data.title).toBe("ใหม่");
```

- route ที่ไม่มี `[...]` ในชื่อโฟลเดอร์ เรียกแค่ `POST(request(...))`
- route ที่มี `[id]` ต้องส่ง `params({ id })` เป็นอาร์กิวเมนต์ที่ 2
- route ของ BE02 (`[[...path]]`) ส่ง path เป็น array: `params({ path: ["sheets", id, "comments"] })`
- ส่งไฟล์: `request(url, { method: "POST", form: sheetForm({...}), cookie })`

### ไฟล์ตัวอย่าง (`helpers/files.ts`)

```ts
import { bigPdfFile, docxFile, fakePdfFile, pdfFile, pngFile, sheetForm } from "../helpers/files";

sheetForm({ title: "สรุป", subjectId, status: "draft" });       // ร่างไม่มีไฟล์
sheetForm({ title: "สรุป", file: pdfFile() });                   // PDF จริง
sheetForm({ title: "x", file: fakePdfFile() });                  // ข้อความเปลี่ยนชื่อเป็น .pdf → ต้องได้ 415
sheetForm({ title: "x", file: bigPdfFile(51) });                 // ใหญ่เกิน 50 MB → 413
```

มีไฟล์ดิบให้ใช้กับ `validateUpload` ด้วย: `pdfBytes()`, `pngBytes()`, `jpegBytes()`, `gifBytes()`, `webpBytes()`, `docxBytes()`, `pptxBytes()`, `xlsxBytes()`, `plainZipBytes()` (zip ธรรมดาที่ไม่ใช่ Office) และ `file(bytes, "ชื่อ.pdf")`

### mock fetch (`helpers/fetch.ts`)

```ts
import { mockFetch } from "../helpers/fetch";

const fetchMock = mockFetch({
  "/api/v1/subjects": { data: [{ id: "s1", name: "คณิต" }] },          // ตอบ 200
  "/api/v1/sheets/x": { status: 404, body: { error: { code: "NOT_FOUND", message: "ไม่พบ" } } },
  "/api/v1/favorites": new TypeError("Failed to fetch"),              // เน็ตหลุด
});

expect(fetchMock).toHaveBeenCalledTimes(1);
expect(fetchMock.mock.calls[0][0]).toContain("q=");                   // ตรวจ URL ที่ถูกเรียก
```

URL ที่ไม่ได้ระบุจะตอบ 404 · fetch จริงถูกคืนให้อัตโนมัติหลังแต่ละ test

### mock โมดูลอื่น (เช่น `next/headers` สำหรับ `session.ts`)

`vi.mock` ถูกย้ายไปบนสุดของไฟล์อัตโนมัติ จึงอ้างตัวแปรธรรมดา (เช่น `alice`) ไม่ได้ — ต้องเก็บค่าใน `vi.hoisted`:

```ts
import { vi } from "vitest";
import { getSession } from "@/lib/session";

const mocks = vi.hoisted(() => ({ cookie: "" }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ cookie: mocks.cookie }) }));

test("ล็อกอินแล้ว getSession ได้ผู้ใช้", async () => {
  const alice = await signUpUser();
  mocks.cookie = alice.cookie;                  // เปลี่ยนค่าก่อนเรียกโค้ด
  expect((await getSession())?.user.id).toBe(alice.id);
});
```

---

## 5. หาให้ครบ 95% — เทคนิค

1. **เริ่มจากกรณีปกติ** (สำเร็จ 200/201) ให้ครบทุกฟังก์ชัน/endpoint ก่อน — ได้ % เร็วที่สุด
2. **ต่อด้วยกรณีผิดพลาดที่โค้ดเขียนไว้:** หา `throw new ApiError(...)`, `if (!user)`, `return bad(...)` ในไฟล์ — แต่ละบรรทัดคือ 1 test
3. **ดูบรรทัดสีแดง** ใน `coverage/index.html` แล้วถามตัวเองว่า "ต้องส่งอะไรเข้าไป ถึงจะวิ่งมาบรรทัดนี้"
4. **ใช้ smoke test เป็นแนว:** `scripts/smoke-test.mjs` มี 280 กรณีที่ระบบต้องทำได้ — ลอกสถานการณ์มาเขียนเป็น unit test ได้เลย
5. ไฟล์ที่บรรทัดน้อยแต่มี `if` เยอะ ใช้เวลามากกว่าที่คิด — เริ่มเร็ว

**test ที่ดี:**
- 1 test ตรวจ 1 เรื่อง · ชื่อบอกสถานการณ์และผล เช่น `"ไม่ใช่เจ้าของแล้วลบ → 403"`
- ตรวจ **ผลลัพธ์จริง** (status, ข้อมูลใน DB, ข้อความ) ไม่ใช่แค่เรียกให้บรรทัดวิ่งผ่าน
- ไม่พึ่งลำดับหรือข้อมูลจาก test ในไฟล์อื่น

---

## 6. กติกา

| เรื่อง | กติกา |
|---|---|
| DB | ใช้ `cmlearn_test` เท่านั้น — ระบบ**ไม่ยอมรัน**ถ้าชื่อ DB ไม่ลงท้าย `_test` (test ลบข้อมูลทั้งตาราง) · อยากใช้ DB อื่นให้ตั้ง `TEST_DATABASE_URL` (ชื่อต้องลงท้าย `_test`) |
| การรัน | ไฟล์ test รันทีละไฟล์ (ใช้ DB เดียวกัน) — อย่าเปลี่ยน `fileParallelism` ใน `vitest.config.mts` |
| ห้ามโกง coverage | ห้ามใส่ `/* v8 ignore */` หรือตัดไฟล์ออกจาก `coverage.include` เอง — บรรทัดที่ test ไม่ได้จริงให้ปรึกษา BE01 / รุ่นพี่ |
| เจอ bug | อย่าแก้โค้ดเงียบ ๆ ให้ test ผ่าน และอย่าเขียน test ให้ผ่านตามพฤติกรรมที่ผิด → จดในช่องหมายเหตุใน Excel + บอกเจ้าของโค้ด |
| ทุกเย็น | กรอก % Lines และสถานะของไฟล์ตัวเองใน Excel · ติดเกินครึ่งวัน → เปลี่ยนเป็น "ติดปัญหา" และบอกในกลุ่ม |
| ก่อน push | `npm.cmd test` ต้องผ่านทั้งหมด |

---

## 7. แก้ปัญหาที่พบบ่อย

| อาการ | สาเหตุ / วิธีแก้ |
|---|---|
| `Tests need DATABASE_URL` | ไม่มีไฟล์ `.env` หรือไม่มี `DATABASE_URL` — คัดลอกจาก `.env.example` แล้วใส่รหัส PostgreSQL ของเครื่อง |
| `password authentication failed` / `ECONNREFUSED` | PostgreSQL ไม่ได้เปิด หรือรหัสใน `.env` ผิด — ลองรัน `npm.cmd run dev` ว่าเว็บต่อ DB ได้ไหม |
| `Refusing to run tests against "..."` | `TEST_DATABASE_URL` ชี้ไปที่ DB ที่ชื่อไม่ลงท้าย `_test` — ระบบกันไว้ไม่ให้ลบข้อมูลจริง |
| `signUpUser failed (422)` | อีเมลซ้ำ — ใช้ `signUpUser()` แบบไม่ระบุอีเมล (สุ่มให้) หรือเรียก `cleanDbBeforeAll()` |
| `npm` ใช้ไม่ได้ใน PowerShell | ใช้ `npm.cmd` / `npx.cmd` แทน |
| test ผ่านในเครื่องเรา แต่ไม่ผ่านในเครื่องเพื่อน | มักพึ่งข้อมูลที่ test อื่นสร้างไว้ — สร้างข้อมูลที่ต้องใช้ในไฟล์ตัวเองเสมอ |
| ไฟล์ที่ไม่ได้แก้ ขึ้น 0% | ปกติ: ระบบนับทุกไฟล์ในขอบเขต แม้ยังไม่มี test |

ติดอะไรถาม **BE01** ได้ตลอด
