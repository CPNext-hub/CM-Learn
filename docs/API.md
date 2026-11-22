# CM Learn API (BE01) — สำหรับทีม Frontend

Base URL (local): `http://localhost:3000` · ทุก endpoint อยู่ใต้ `/api/v1` ยกเว้น Auth ที่อยู่ใต้ `/api/auth`

## ข้อตกลงร่วม

- **Login ใช้ cookie session** — เรียกจากหน้าเว็บโดเมนเดียวกันด้วย `fetch(url)` ได้เลย cookie ถูกส่งไปเอง ไม่ต้องจัดการ token
- **Response สำเร็จ:** `{ "data": ... }` · รายการที่แบ่งหน้าจะมี `"pagination": { page, pageSize, total, totalPages }`
- **Response ผิดพลาด:** `{ "error": { "code", "message", "details"? } }` — `message` เป็นภาษาไทยพร้อมแสดงผู้ใช้ได้, `details` คือ error รายช่อง เช่น `{ "title": "กรุณากรอกชื่อชีท" }`

| HTTP | code | ความหมาย |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | ข้อมูลที่ส่งมาไม่ถูกต้อง (ดู `details`) |
| 401 | `UNAUTHORIZED` | ต้อง login ก่อน |
| 403 | `FORBIDDEN` | login แล้วแต่ไม่ใช่เจ้าของ |
| 404 | `NOT_FOUND` | ไม่พบ หรือไม่มีสิทธิ์เห็น (เช่น draft ของคนอื่น) |
| 413 | `FILE_TOO_LARGE` | ไฟล์ใหญ่เกิน 50 MB |
| 415 | `UNSUPPORTED_FILE_TYPE` | ชนิดไฟล์ไม่รองรับ |
| 500 | `INTERNAL_ERROR` | ระบบผิดพลาด |

- **ไฟล์ที่รองรับ:** `.pdf .png .jpg .jpeg .webp .gif .docx .pptx .xlsx` ไม่เกิน 50 MB (ระบบตรวจชนิดจากเนื้อไฟล์จริง เปลี่ยนนามสกุลหลอกไม่ได้)
- **สถานะชีท:** `draft` (ร่าง เห็นเฉพาะเจ้าของ) · `published` (เผยแพร่) · `hidden` (เจ้าของซ่อน เห็นเฉพาะเจ้าของ)
- เวลาเป็น ISO 8601 UTC เช่น `2026-11-21T05:00:00.000Z` — แปลงเป็นเวลาไทยฝั่ง FE

## Auth (Better Auth)

ใช้ `authClient` จาก `src/lib/auth-client.ts` (หน้า `/login`, `/register` และ `SignOutButton` มีตัวอย่างแล้ว)

| ทำอะไร | เรียก | Endpoint |
| --- | --- | --- |
| สมัคร | `authClient.signUp.email({ name, email, password })` | `POST /api/auth/sign-up/email` |
| เข้าสู่ระบบ | `authClient.signIn.email({ email, password })` | `POST /api/auth/sign-in/email` |
| ออกจากระบบ | `authClient.signOut()` | `POST /api/auth/sign-out` |
| ผู้ใช้ปัจจุบัน | `authClient.useSession()` / `authClient.getSession()` | `GET /api/auth/get-session` (ไม่ login = `null`) |
| Google / Facebook | `authClient.signIn.social({ provider, callbackURL })` | ต้องตั้ง credential ใน `.env` ก่อน |

รหัสผ่านอย่างน้อย 8 ตัว · error code ที่พบบ่อย: `USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL`, `PASSWORD_TOO_SHORT`, `INVALID_EMAIL_OR_PASSWORD`

## Sheet object

ทุก endpoint ด้านล่างที่คืน "Sheet" ใช้รูปแบบนี้

```json
{
  "id": "uuid",
  "title": "สรุปแคลคูลัส บทที่ 1",
  "description": "ลิมิตและอนุพันธ์",
  "status": "published",
  "viewCount": 12,
  "likeCount": 3,
  "dislikeCount": 0,
  "commentCount": 2,
  "owner": { "id": "...", "name": "User A", "image": null },
  "subject": { "id": "uuid", "name": "คณิตศาสตร์" },
  "category": { "id": "uuid", "name": "สรุปเนื้อหา" },
  "file": { "mimeType": "application/pdf", "sizeBytes": 123456, "versionNo": 1 },
  "previewUrl": "/api/v1/sheets/<id>/download?inline=1",
  "downloadUrl": "/api/v1/sheets/<id>/download",
  "createdAt": "2026-11-21T05:00:00.000Z",
  "updatedAt": "2026-11-21T05:00:00.000Z"
}
```

- `subject`, `category`, `file` อาจเป็น `null`
- `previewUrl` มีค่าเฉพาะ PDF/รูปภาพ (ใช้ใน `<iframe>` หรือ `<img>`) — ไฟล์ Office เป็น `null` ให้แสดงปุ่มดาวน์โหลดแทน

## Endpoints

### `GET /api/v1/subjects` · `GET /api/v1/categories`
รายการวิชา/หมวดหมู่สำหรับ dropdown → `data: [{ id, name }]`

### `GET /api/v1/sheets` — Home / Search / Filter (ไม่ต้อง login)
แสดงเฉพาะชีท `published`

| Query | ค่า |
| --- | --- |
| `q` | คำค้นในชื่อ/คำอธิบาย (ค้นภาษาไทยบางส่วนของคำได้) |
| `subjectId`, `categoryId` | uuid จาก subjects/categories |
| `sort` | `newest` (ค่าเริ่มต้น) หรือ `popular` (ยอดดู) |
| `page`, `pageSize` | เริ่ม 1, ค่าเริ่มต้น 12, สูงสุด 50 |

ตัวอย่าง: `/api/v1/sheets?q=แคลคูลัส&subjectId=<uuid>&page=1` → `data: Sheet[]`, `pagination`

### `GET /api/v1/sheets/:id` — Sheet Detail
คืน Sheet + `viewer: { isOwner, reaction }` (`reaction` = `"like"`/`"dislike"`/`null`)
ใช้ `viewer.isOwner` ตัดสินว่าจะแสดงปุ่ม Edit/Delete · เปิดดูแต่ละครั้ง (ที่ไม่ใช่เจ้าของ) เพิ่ม `viewCount`

### `POST /api/v1/sheets` — Upload (ต้อง login)
ส่งแบบ `multipart/form-data`:

| Field | จำเป็น | หมายเหตุ |
| --- | --- | --- |
| `title` | ✅ | ไม่เกิน 200 ตัวอักษร |
| `description` | | ไม่เกิน 5000 ตัวอักษร |
| `subjectId`, `categoryId` | | uuid |
| `status` | | `published` (ค่าเริ่มต้น) หรือ `draft` |
| `file` | ✅ เมื่อ `published` | ไฟล์ชีท |

```js
const form = new FormData();
form.append("title", title);
form.append("subjectId", subjectId);
form.append("file", fileInput.files[0]);
const res = await fetch("/api/v1/sheets", { method: "POST", body: form }); // ห้ามตั้ง Content-Type เอง
const json = await res.json(); // 201 → json.data คือ Sheet
```

Flow "Upload → กรอกรายละเอียด → Preview → Confirm": ให้ Preview ฝั่ง FE ด้วย `URL.createObjectURL(file)` ก่อน แล้วค่อยเรียก POST ตอนกด Confirm

### `PATCH /api/v1/sheets/:id` — Edit (เจ้าของเท่านั้น)
- แก้ข้อมูล: JSON `{ title?, description?, subjectId?, categoryId?, status? }` — ส่งเฉพาะช่องที่เปลี่ยน, ส่ง `null` เพื่อล้างค่า
- เปลี่ยนไฟล์: `multipart/form-data` ช่องเดียวกัน + `file` → สร้างเวอร์ชันใหม่ ไฟล์เดิมยังเก็บไว้
- `status`: `draft` / `published` / `hidden` (ซ่อน = ใช้แทนการลบชั่วคราว)

### `DELETE /api/v1/sheets/:id` — Delete (เจ้าของเท่านั้น)
→ `data: { id, deleted: true }` · ชีทหายจากทุกหน้า (soft delete ข้อมูลยังอยู่ใน DB)

### `GET /api/v1/users/me/sheets` — My Sheets (ต้อง login)
ชีทของตัวเองทุกสถานะ (ยกเว้นที่ลบแล้ว) · Query: `status` (ไม่บังคับ), `page`, `pageSize`

### `GET /api/v1/sheets/:id/download` — Download / Preview
- ดาวน์โหลด: `<a href={sheet.downloadUrl}>ดาวน์โหลด</a>` (ชื่อไฟล์ = ชื่อชีท)
- Preview: `<iframe src={sheet.previewUrl}>` สำหรับ PDF หรือ `<img src={sheet.previewUrl}>` สำหรับรูป
- สิทธิ์เหมือนหน้า Detail: ชีท draft/hidden ดาวน์โหลดได้เฉพาะเจ้าของ

## Profile

### `GET /api/v1/users/me` — โปรไฟล์ของตัวเอง (ต้อง login)
```json
{
  "data": {
    "id": "...", "name": "PA NU", "email": "panu@example.com",
    "image": "/api/v1/users/<id>/avatar?v=<file>" | null,
    "bio": "ชอบเรียนรู้เทคโนโลยี" | null,
    "role": "user", "createdAt": "2026-11-21T05:00:00.000Z",
    "stats": { "sheetCount": 12, "publishedCount": 10, "totalViews": 468, "likeCount": 24 }
  }
}
```
- `stats` นับเฉพาะชีทที่ยังไม่ถูกลบ: `sheetCount` = ทุกสถานะ, `publishedCount` = เผยแพร่, `totalViews` = ยอดดูรวม, `likeCount` = Like ที่ได้รับ
- ยังไม่มียอดดาวน์โหลด (ระบบไม่ได้นับ) — ใช้ `totalViews` แทน

### `PATCH /api/v1/users/me` — แก้โปรไฟล์ (JSON, ส่งเฉพาะช่องที่แก้)
| ช่อง | กติกา |
| --- | --- |
| `name` | บังคับมีตัวอักษร, ไม่เกิน 100 |
| `bio` | ไม่เกิน 500, ส่ง `null` หรือ `""` เพื่อล้าง |
| `image` | ส่ง `null` เพื่อลบรูป (ตั้งรูปใหม่ใช้ endpoint avatar) |

ช่องอื่น (`email`, `role`, …) → 400 · ตอบกลับเป็นโปรไฟล์ล่าสุด (รูปแบบเดียวกับ GET)
หลังแก้ชื่อ ให้เรียก `refetch()` จาก `authClient.useSession()` เพื่อให้ Navbar แสดงชื่อใหม่

### `POST /api/v1/users/me/avatar` — อัปโหลดรูปโปรไฟล์ (ต้อง login)
`multipart/form-data` ช่อง `file` · PNG / JPG / WEBP ไม่เกิน 2 MB (ตรวจจากเนื้อไฟล์จริง) → โปรไฟล์ล่าสุด, `image` เป็น URL ใหม่ · รูปเดิมถูกลบให้อัตโนมัติ
```js
const form = new FormData();
form.append("file", fileInput.files[0]);
const res = await fetch("/api/v1/users/me/avatar", { method: "POST", body: form });
```

### รูปโปรไฟล์ในหน้าเว็บ
ใช้ `image` ตรง ๆ: `<img src={profile.image}>` หรือ `<img src={sheet.owner.image}>` — เป็นได้ทั้ง URL ของเรา (`/api/v1/users/<id>/avatar?v=...` เปิดดูได้ทุกคน) หรือ URL ภายนอก (เช่นรูปจาก Google) · ถ้าเป็น `null` ให้แสดงตัวอักษรย่อของชื่อแทน

## ยังไม่มี (กำลังทำ)
- โปรไฟล์สาธารณะของผู้ใช้อื่น `GET /api/v1/users/:id` — เลื่อนไปหลัง MVP
- Comment / Reply / Like / Dislike — BE02

## ข้อจำกัดที่ FE ควรรู้
- ไฟล์ดาวน์โหลดส่งแบบ chunked (Next.js ไม่ส่ง `Content-Length`) — แสดงขนาดไฟล์จาก `sheet.file.sizeBytes`
- ไฟล์เก็บบนดิสก์ของเครื่อง: Upload/Download ใช้ได้ตอนรันในเครื่อง/Node server แต่**ยังใช้บน Cloudflare Workers ไม่ได้**จนกว่าจะย้ายไป R2
