# CM Learn

ฐานโปรเจกต์สำหรับเว็บสร้างวิชาและสรุปเนื้อหาเพื่อแบ่งปันให้ผู้เรียน

## เทคโนโลยีที่เลือก

- **Frontend และ application API:** Next.js + TypeScript + Tailwind CSS
- **Authentication:** Better Auth รองรับ email/password และ Google/Facebook OAuth
- **Database:** PostgreSQL ผ่าน Drizzle ORM
- **Local development:** Docker Compose สำหรับ PostgreSQL
- **Hosting:** Cloudflare Workers ผ่าน OpenNext adapter ใน starter นี้

ใช้ TypeScript ทั้งฝั่ง UI และ server เพื่อให้ทีมแชร์ type และเพิ่มฟีเจอร์ได้ง่ายในช่วงเริ่มต้น ยังไม่แยก Node API service เพราะ Next.js Route Handlers เพียงพอสำหรับ product รุ่นแรก หากภายหลังมี API สำหรับ mobile, งานเบื้องหลัง หรือทีม backend แยก deployment ค่อยแยก service (เช่น Hono/Fastify) ออกได้โดยคง TypeScript และ schema เดิมไว้

> Cloudflare อัปเดตคู่มือ Next.js และปัจจุบันแนะนำ vinext เป็นทางเริ่มต้นสำหรับ Workers ส่วน repo นี้ปัก OpenNext เพื่อเป็น adapter สำหรับ Next.js ที่แยกจาก framework โดยตรง ก่อนเลือก production ให้ทดลอง build กับฟีเจอร์ที่ใช้จริงและยืนยัน compatibility บน Cloudflare account ของทีม

## เริ่มทำงานในเครื่อง

1. ติดตั้ง Node.js 22+, npm และ Docker Desktop
2. คัดลอก `.env.example` เป็น `.env` แล้วกำหนด secret และ OAuth credentials
3. เปิดฐานข้อมูล: `docker compose up -d db` หรือใช้ PostgreSQL ที่ติดตั้งในเครื่อง (สร้าง database `cmlearn` แล้วแก้ `DATABASE_URL` ใน `.env`)
4. ติดตั้งแพ็กเกจ: `npm install`
5. ใช้ migration เริ่มต้น: `npm run db:migrate`
6. เมื่อแก้ schema ให้สร้าง migration ใหม่ด้วย `npm run db:generate` แล้วใช้ `npm run db:migrate`
7. เริ่มเว็บ: `npm run dev`

เว็บจะเปิดที่ `http://localhost:3000` ส่วน callback URL สำหรับ OAuth ใน local:

- Google: `http://localhost:3000/api/auth/callback/google`
- Facebook: `http://localhost:3000/api/auth/callback/facebook`

เพิ่ม URL เหล่านี้ใน OAuth provider console และตั้งค่า client ID/secret ใน `.env` ก่อนทดสอบ login

## สิทธิ์และการเข้าสู่ระบบ

- `/dashboard` ต้องมี session ก่อนเข้า
- `/admin` ต้องมี session และ `user.role = admin`
- ผู้ใช้ใหม่ได้ role `user` โดยอัตโนมัติ
- กำหนดอีเมล admin ที่เชื่อถือได้ใน `ADMIN_EMAILS` (คั่นหลายอีเมลด้วย comma) ก่อนบัญชีนั้นลงทะเบียนครั้งแรก
- ตรวจสิทธิ์ซ้ำใน server action หรือ Route Handler ทุกครั้งก่อนแก้ข้อมูล ห้ามใช้การซ่อนปุ่มใน UI เป็น access control
- การตั้ง role ด้วย environment ใช้ bootstrap admin เท่านั้น หลังเริ่มระบบให้จัดการสิทธิ์ผ่านขั้นตอน admin ที่ทีมกำหนดและป้องกัน credential ให้เหมาะสม

ห้าม commit `.env` หรือ credentials; production secrets ให้เก็บใน Cloudflare secrets และใช้ PostgreSQL production แยกจาก local

## โครงสร้างข้อมูล (Core MVP)

นิยามทั้งหมดอยู่ใน `src/db/schema.ts` และ migration อยู่ใน `src/db/migrations/`

| ตาราง | ความหมาย | กติกาสำคัญ |
| --- | --- | --- |
| `user` (+ `session`, `account`, `verification`) | ผู้ใช้ (ตาราง Better Auth) ใช้แทน `users` ในเอกสารออกแบบ: `name` = display_name, `image` = avatar_url, password hash อยู่ใน `account.password` | email ไม่ซ้ำแบบไม่สนตัวพิมพ์ (`users_email_lower_uq`), soft delete ผ่าน `deleted_at` |
| `subjects`, `categories` | รายการวิชา/หมวดหมู่ (มีข้อมูลตั้งต้นจาก migration `0002_seed_lookups`) | ชื่อไม่ซ้ำและไม่ว่าง |
| `sheets` | ชีทเรียน | `status` = `draft`/`published`/`hidden`, soft delete, GIN full-text index บน title + description |
| `sheet_files` | metadata ไฟล์ของชีท (ไฟล์จริงอยู่นอก DB) | unique `(sheet_id, version_no, asset_type)`, ห้ามส่ง `storage_key` ให้ client |
| `comments` | ความคิดเห็นและ reply | composite FK บังคับให้ reply อยู่ชีทเดียวกับ parent; จำกัด reply หนึ่งระดับใน API |
| `sheet_reactions` | Like/Dislike | PK `(user_id, sheet_id)` = หนึ่ง reaction ต่อคนต่อชีท; สลับประเภทด้วย upsert |

ข้อตกลง: ตารางใหม่ใช้ UUID แต่ FK ที่ชี้ไป `user.id` เป็น `text` (Better Auth สร้าง id เป็น text); เวลาเป็น `timestamptz`; `updated_at` อัปเดตอัตโนมัติเมื่อแก้ผ่าน `db.update(...)` ของ Drizzle

Migration `0001_core_schema` อัปเกรดฐานข้อมูลที่เคยรัน `0000_initial` ได้โดยไม่เสียข้อมูล: ตาราง `subject`/`summary` ของ starter ถูกเปลี่ยนชื่อเป็น `legacy_subject`/`legacy_summary` (แอปไม่ใช้แล้ว ลบได้เมื่อทีมยืนยันว่าไม่ต้องการข้อมูล) และชื่อวิชาเดิมถูกคัดลอกเข้า `subjects`; ห้ามแก้ migration ที่ push ไปแล้ว ให้เพิ่ม migration ใหม่เสมอ

การเชื่อมต่อ DB ใช้ `getDb()` จาก `src/db/client.ts` เท่านั้น (local reuse connection pool เดียว, Cloudflare สร้างต่อ request ผ่าน Hyperdrive)

ค้นหา full-text ต้องใช้ expression เดียวกับ index จึงจะใช้ index ได้:
`to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(description, ''))`

## คำสั่ง

| คำสั่ง | ใช้ทำอะไร |
| --- | --- |
| `npm run dev` | เปิด development server |
| `npm run typecheck` | ตรวจ TypeScript |
| `npm run lint` | ตรวจ lint |
| `npm run db:generate` | สร้าง SQL migration จาก schema |
| `npm run db:migrate` | apply migration |
| `npm run db:studio` | เปิด Drizzle Studio |
| `npm run cf:preview` | build และ preview บน Workers runtime |
| `npm run cf:deploy` | deploy ไป Cloudflare Workers |
| `npm run test:smoke` | ทดสอบ API ของ BE01 แบบ end-to-end กับ dev server ที่รันอยู่ (สร้างและลบข้อมูลทดสอบเอง) |

> **Windows:** ถ้า PowerShell ขึ้นว่า `running scripts is disabled` ให้ใช้ `npm.cmd` แทน `npm` เช่น `npm.cmd run dev`
>
> **ห้ามรัน `npm run build` หรือ dev server ตัวที่สองขณะที่ dev server รันอยู่** — ทั้งคู่เขียนโฟลเดอร์ `.next` เดียวกันและทำให้เสีย; ให้หยุด dev server, ลบ `.next`, build, แล้วลบ `.next` ก่อนเปิด dev ใหม่

## ทดสอบระบบ

- **หน้าทดสอบ BE:** เปิด `http://localhost:3000/test` (HTML ล้วน ไม่มี CSS) ใช้ลองสมัคร/อัปโหลด/ค้นหา/แก้ไข/ลบ/ดาวน์โหลดกับ API จริง — ถูกปิด (404) อัตโนมัติใน production
- **ทดสอบอัตโนมัติ:** เปิด dev server แล้วรัน `npm run test:smoke`
- **เอกสาร API สำหรับ FE:** `docs/API.md`

## Cloudflare และฐานข้อมูล

ตั้งค่า Workers project และ secrets ก่อน deploy (`BETTER_AUTH_SECRET`, OAuth client secrets และ URL ที่เป็น production) ใช้ PostgreSQL managed provider ที่เข้าถึงจาก Workers ได้; สร้าง Hyperdrive ด้วย `npx wrangler hyperdrive create cm-learn-db --connection-string="<postgres-url>"` แล้วใส่ binding และ ID ที่ได้ลงใน `hyperdrive` ของ `wrangler.jsonc` (binding name ต้องเป็น `HYPERDRIVE`) อย่า commit connection string หรือ production credential

> ⚠️ **ไฟล์ชีทตอนนี้เก็บบนดิสก์ของเครื่อง (`UPLOAD_DIR`, ค่าเริ่มต้น `uploads/`)** ผ่าน `src/lib/storage.ts` — ใช้ได้กับ `npm run dev`, Docker หรือ Node server ที่มีดิสก์ถาวรเท่านั้น **Cloudflare Workers ไม่มีดิสก์ถาวร Upload/Download จึงยังใช้บน Workers ไม่ได้** ก่อน deploy ต้องเปลี่ยน `storage.ts` ไปใช้ R2 (หรือ object storage อื่น) — ไฟล์อื่นไม่ต้องแก้ เพราะทุกส่วนเรียกผ่าน `saveFile` / `openFile` / `deleteFile`

Dockerfile มีไว้รัน Next.js แบบ standalone ใน Node container สำหรับ local/CI หรือ hosting ที่รองรับ container; การ deploy ไป Cloudflare ใช้คำสั่ง `cf:preview`/`cf:deploy` แทน Docker image

## GitHub

แนะนำ branch protection สำหรับ `main`, pull request review, และ GitHub Actions ที่รัน `npm ci`, `npm run typecheck`, `npm run lint` และ `npm run build` เมื่อทีมพร้อมเพิ่ม workflow และกำหนด secrets แล้ว
