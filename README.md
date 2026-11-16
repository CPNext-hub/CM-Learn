# CM Learn

ฐานโปรเจกต์สำหรับเว็บสร้างวิชาและสรุปเนื้อหาเพื่อแบ่งปันให้ผู้เรียน

## เทคโนโลยีที่เลือก

- **Frontend และ application API:** Next.js + TypeScript + Tailwind CSS
- **Authentication:** Better Auth รองรับ Google และ Facebook OAuth
- **Database:** PostgreSQL ผ่าน Drizzle ORM
- **Local development:** Docker Compose สำหรับ PostgreSQL
- **Hosting:** Cloudflare Workers ผ่าน OpenNext adapter ใน starter นี้

ใช้ TypeScript ทั้งฝั่ง UI และ server เพื่อให้ทีมแชร์ type และเพิ่มฟีเจอร์ได้ง่ายในช่วงเริ่มต้น ยังไม่แยก Node API service เพราะ Next.js Route Handlers เพียงพอสำหรับ product รุ่นแรก หากภายหลังมี API สำหรับ mobile, งานเบื้องหลัง หรือทีม backend แยก deployment ค่อยแยก service (เช่น Hono/Fastify) ออกได้โดยคง TypeScript และ schema เดิมไว้

> Cloudflare อัปเดตคู่มือ Next.js และปัจจุบันแนะนำ vinext เป็นทางเริ่มต้นสำหรับ Workers ส่วน repo นี้ปัก OpenNext เพื่อเป็น adapter สำหรับ Next.js ที่แยกจาก framework โดยตรง ก่อนเลือก production ให้ทดลอง build กับฟีเจอร์ที่ใช้จริงและยืนยัน compatibility บน Cloudflare account ของทีม

## เริ่มทำงานในเครื่อง

1. ติดตั้ง Node.js 22+, npm และ Docker Desktop
2. คัดลอก `.env.example` เป็น `.env` แล้วกำหนด secret และ OAuth credentials
3. เปิดฐานข้อมูล: `docker compose up -d db`
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

## โครงสร้างข้อมูลเริ่มต้น

- `user`, `session`, `account`, `verification`: ตาราง Better Auth
- `subject`: วิชา เจ้าของ และสถานะเผยแพร่
- `summary`: สรุปภายในวิชา

โครง quiz ในอนาคตแนะนำเพิ่ม `quiz`, `question`, `answer_option`, `quiz_attempt` และ `comment` โดยเก็บ feedback ถูก/ผิดเป็นความสัมพันธ์กับคำตอบ/attempt และตรวจสิทธิ์เจ้าของหรือสถานะเผยแพร่ฝั่ง server

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

## Cloudflare และฐานข้อมูล

ตั้งค่า Workers project และ secrets ก่อน deploy (`BETTER_AUTH_SECRET`, OAuth client secrets และ URL ที่เป็น production) ใช้ PostgreSQL managed provider ที่เข้าถึงจาก Workers ได้; สร้าง Hyperdrive ด้วย `npx wrangler hyperdrive create cm-learn-db --connection-string="<postgres-url>"` แล้วใส่ binding และ ID ที่ได้ลงใน `hyperdrive` ของ `wrangler.jsonc` (binding name ต้องเป็น `HYPERDRIVE`) อย่า commit connection string หรือ production credential

Dockerfile มีไว้รัน Next.js แบบ standalone ใน Node container สำหรับ local/CI หรือ hosting ที่รองรับ container; การ deploy ไป Cloudflare ใช้คำสั่ง `cf:preview`/`cf:deploy` แทน Docker image

## GitHub

แนะนำ branch protection สำหรับ `main`, pull request review, และ GitHub Actions ที่รัน `npm ci`, `npm run typecheck`, `npm run lint` และ `npm run build` เมื่อทีมพร้อมเพิ่ม workflow และกำหนด secrets แล้ว
