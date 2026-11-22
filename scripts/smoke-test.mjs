// End-to-end smoke test for the BE01 APIs (Auth, Sheets, Upload/Download).
// Runs real HTTP requests against a running dev server and checks the database + files on disk.
//
//   npm run test:smoke                      (server at http://localhost:3000)
//   npm run test:smoke -- http://host:port
//
// It creates its own users/sheets (alice-<run>@smoke.test, bob-<run>@smoke.test) and deletes ONLY those
// at the end, so it is safe to run while other people use the same database.
import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { readdir, rm } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

const BASE = process.argv[2] ?? "http://localhost:3000";
const UPLOAD_ROOT = path.resolve(process.env.UPLOAD_DIR ?? "uploads");
const MAX_MB = Number(process.env.MAX_UPLOAD_MB ?? 50);
const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`; // unique per run
const EMAIL_A = `alice-${RUN}@smoke.test`;
const EMAIL_B = `bob-${RUN}@smoke.test`;
const RUN_EMAILS = [EMAIL_A, EMAIL_B, `s-${RUN}@smoke.test`]; // every account this run may create
const sql = postgres(process.env.DATABASE_URL, { max: 2, onnotice: () => {} });

// ---------------------------------------------------------------------------
// Tiny test framework
// ---------------------------------------------------------------------------
let passed = 0;
const failures = [];
let section = "";
function group(name) {
  section = name;
  console.log(`\n== ${name}`);
}
function check(name, condition, detail = "") {
  if (condition) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failures.push(`[${section}] ${name} ${detail}`);
    console.log(`  ✗ ${name} ${detail}`);
  }
}
function hasApiEnvelope(response, kind) {
  const body = response?.json;
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;
  if (kind === "success") return Object.keys(body).length === 1 && Object.hasOwn(body, "data");
  const error = body.error;
  return Object.keys(body).length === 1 && !!error && typeof error === "object" &&
    typeof error.code === "string" && typeof error.message === "string" &&
    Object.keys(error).every((key) => ["code", "message", "details"].includes(key));
}
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");

// ---------------------------------------------------------------------------
// HTTP client with a cookie jar (one per simulated user)
// ---------------------------------------------------------------------------
class Client {
  cookies = new Map();
  async req(pathname, { method = "GET", json, form, body, headers = {} } = {}) {
    const h = { Origin: BASE, ...headers };
    if (this.cookies.size) h.Cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
    let payload = body;
    if (json !== undefined) {
      h["Content-Type"] = "application/json";
      payload = typeof json === "string" ? json : JSON.stringify(json);
    }
    if (form) payload = form;
    const send = () => fetch(BASE + pathname, { method, headers: h, body: payload, duplex: "half", redirect: "manual" });
    let res;
    try {
      res = await send();
    } catch (error) {
      // After the server rejects an oversized upload mid-stream (413), Node's fetch may reuse that
      // now-closed keep-alive socket once. Browsers open a new connection; we retry once to do the same.
      if (payload instanceof ReadableStream || error?.cause?.code !== "ECONNRESET") throw error;
      res = await send();
    }
    for (const cookie of res.headers.getSetCookie()) {
      const [pair] = cookie.split(";");
      const i = pair.indexOf("=");
      const value = pair.slice(i + 1);
      if (value) this.cookies.set(pair.slice(0, i), value);
      else this.cookies.delete(pair.slice(0, i));
    }
    const type = res.headers.get("content-type") ?? "";
    const raw = new Uint8Array(await res.arrayBuffer());
    let data = null;
    if (type.includes("json")) data = JSON.parse(new TextDecoder().decode(raw));
    return { status: res.status, headers: res.headers, json: data, bytes: raw };
  }
}

// ---------------------------------------------------------------------------
// Test files (built in memory)
// ---------------------------------------------------------------------------
const b64 = (s) => new Uint8Array(Buffer.from(s, "base64"));
const PNG = b64("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==");
const GIF = b64("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==");
const JPG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new TextEncoder().encode("JFIF test jpeg body"), 0xff, 0xd9]);
const WEBP = new Uint8Array([...new TextEncoder().encode("RIFF"), 20, 0, 0, 0, ...new TextEncoder().encode("WEBPVP8 test")]);
const pdf = (text) => new TextEncoder().encode(`%PDF-1.4\n% ${text}\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n`);

// Minimal ZIP writer (STORED, no compression) so we can build real docx/pptx/xlsx structures.
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (bytes) => {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function zip(names) {
  const enc = new TextEncoder();
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const name of names) {
    const n = enc.encode(name);
    const data = enc.encode("<x/>");
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(n.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
    central.writeUInt32LE(crc, 16); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(n.length, 28); central.writeUInt32LE(offset, 42);
    locals.push(local, n, data);
    centrals.push(central, n);
    offset += 30 + n.length + data.length;
  }
  const cdSize = centrals.reduce((s, b) => s + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(names.length, 8); end.writeUInt16LE(names.length, 10);
  end.writeUInt32LE(cdSize, 12); end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...locals, ...centrals, end]));
}
const OFFICE = (main) => zip(["[Content_Types].xml", "_rels/.rels", main]);

const FILES = {
  pdf: { bytes: pdf("v1"), name: "a.pdf", mime: "application/pdf", ext: ".pdf", preview: true },
  png: { bytes: PNG, name: "a.png", mime: "image/png", ext: ".png", preview: true },
  jpg: { bytes: JPG, name: "a.jpg", mime: "image/jpeg", ext: ".jpg", preview: true },
  gif: { bytes: GIF, name: "a.gif", mime: "image/gif", ext: ".gif", preview: true },
  webp: { bytes: WEBP, name: "a.webp", mime: "image/webp", ext: ".webp", preview: true },
  docx: { bytes: OFFICE("word/document.xml"), name: "a.docx", ext: ".docx", preview: false,
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
  pptx: { bytes: OFFICE("ppt/presentation.xml"), name: "a.pptx", ext: ".pptx", preview: false,
    mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation" },
  xlsx: { bytes: OFFICE("xl/workbook.xml"), name: "a.xlsx", ext: ".xlsx", preview: false,
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
};

function sheetForm(fields, file) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  if (file) form.append("file", new File([file.bytes], file.name));
  return form;
}
const decodeFileName = (disposition) => decodeURIComponent(/filename\*=UTF-8''([^;]+)/.exec(disposition ?? "")?.[1] ?? "");

// ---------------------------------------------------------------------------
async function main() {
  const health = await fetch(`${BASE}/api/auth/ok`).catch(() => null);
  if (!health?.ok) throw new Error(`Server not reachable at ${BASE} — start it with "npm.cmd run dev" first`);

  const guest = new Client();
  const alice = new Client();
  const bob = new Client();
  const emailA = EMAIL_A;
  const emailB = EMAIL_B;

  // ----------------------------------------------------------------- Auth
  group("Auth");
  let r = await alice.req("/api/auth/sign-up/email", { method: "POST", json: { name: "Alice ทดสอบ", email: emailA, password: "password1234" } });
  check("สมัคร Alice → 200", r.status === 200, `got ${r.status}`);
  r = await bob.req("/api/auth/sign-up/email", { method: "POST", json: { name: "Bob", email: emailB, password: "password1234" } });
  check("สมัคร Bob → 200", r.status === 200, `got ${r.status}`);
  r = await guest.req("/api/auth/sign-up/email", { method: "POST", json: { name: "Dup", email: emailA.toUpperCase(), password: "password1234" } });
  check("สมัคร email ซ้ำ (ตัวพิมพ์ต่าง) → 422", r.status === 422, `got ${r.status}`);
  r = await guest.req("/api/auth/sign-up/email", { method: "POST", json: { name: "S", email: `s-${RUN}@smoke.test`, password: "123" } });
  check("รหัสสั้นเกิน → 400", r.status === 400, `got ${r.status}`);
  r = await guest.req("/api/auth/sign-in/email", { method: "POST", json: { email: emailA, password: "wrong-pass" } });
  check("รหัสผิด → 401", r.status === 401, `got ${r.status}`);
  r = await alice.req("/api/auth/get-session");
  check("get-session คืนผู้ใช้", r.json?.user?.email === emailA);
  const [stored] = await sql`select a.password from account a join "user" u on u.id = a.user_id where u.email = ${emailA}`;
  check("DB เก็บรหัสเป็น hash ไม่ใช่ plaintext", stored && !stored.password.includes("password1234") && stored.password.length > 60);
  await alice.req("/api/auth/sign-out", { method: "POST", json: {} });
  r = await alice.req("/api/auth/get-session");
  check("หลัง sign-out ไม่มี session", r.json === null);
  r = await alice.req("/api/auth/sign-in/email", { method: "POST", json: { email: emailA, password: "password1234" } });
  check("sign-in อีกครั้ง → 200", r.status === 200, `got ${r.status}`);

  // ----------------------------------------------------------------- Lookups
  group("Subjects / Categories");
  const subjects = (await guest.req("/api/v1/subjects")).json?.data ?? [];
  const categories = (await guest.req("/api/v1/categories")).json?.data ?? [];
  check("มีวิชาตั้งต้น ≥ 9", subjects.length >= 9, `got ${subjects.length}`);
  check("มีหมวดหมู่ตั้งต้น ≥ 5", categories.length >= 5, `got ${categories.length}`);
  const math = subjects.find((s) => s.name === "คณิตศาสตร์");
  const physics = subjects.find((s) => s.name === "ฟิสิกส์");
  const summaryCat = categories.find((c) => c.name === "สรุปเนื้อหา");

  // ----------------------------------------------------------------- Upload: validation
  group("Upload — validation");
  r = await guest.req("/api/v1/sheets", { method: "POST", form: sheetForm({ title: "x" }, FILES.pdf) });
  check("ไม่ login → 401", r.status === 401, `got ${r.status}`);
  r = await alice.req("/api/v1/sheets", { method: "POST", form: sheetForm({}, FILES.pdf) });
  check("ไม่มี title → 400 + details.title", r.status === 400 && !!r.json?.error?.details?.title);
  r = await alice.req("/api/v1/sheets", { method: "POST", form: sheetForm({ title: "ก".repeat(201) }, FILES.pdf) });
  check("title 201 ตัว → 400", r.status === 400);
  r = await alice.req("/api/v1/sheets", { method: "POST", form: sheetForm({ title: "x", description: "ก".repeat(5001) }, FILES.pdf) });
  check("description 5001 ตัว → 400", r.status === 400);
  r = await alice.req("/api/v1/sheets", { method: "POST", form: sheetForm({ title: "x", subjectId: "00000000-0000-0000-0000-000000000000" }, FILES.pdf) });
  check("subjectId ที่ไม่มีจริง → 400", r.status === 400 && !!r.json?.error?.details?.subjectId);
  r = await alice.req("/api/v1/sheets", { method: "POST", form: sheetForm({ title: "x", categoryId: "not-uuid" }, FILES.pdf) });
  check("categoryId รูปแบบผิด → 400", r.status === 400);
  r = await alice.req("/api/v1/sheets", { method: "POST", form: sheetForm({ title: "x", status: "hidden" }, FILES.pdf) });
  check("สร้างด้วย status=hidden ไม่ได้ → 400", r.status === 400);
  r = await alice.req("/api/v1/sheets", { method: "POST", form: sheetForm({ title: "x" }) });
  check("เผยแพร่โดยไม่มีไฟล์ → 400", r.status === 400);
  const html = { bytes: new TextEncoder().encode("<html><script>alert(1)</script></html>"), name: "evil.pdf" };
  r = await alice.req("/api/v1/sheets", { method: "POST", form: sheetForm({ title: "x" }, html) });
  check("HTML ปลอมเป็น .pdf → 415", r.status === 415);
  const exe = { bytes: new Uint8Array([0x4d, 0x5a, 0x90, 0, 3, 0, 0, 0]), name: "virus.png" };
  r = await alice.req("/api/v1/sheets", { method: "POST", form: sheetForm({ title: "x" }, exe) });
  check("ไฟล์ .exe ปลอมเป็น .png → 415", r.status === 415);
  r = await alice.req("/api/v1/sheets", { method: "POST", form: sheetForm({ title: "x" }, { bytes: zip(["readme.txt"]), name: "fake.docx" }) });
  check("ZIP ธรรมดาเปลี่ยนชื่อเป็น .docx → 415", r.status === 415);
  r = await alice.req("/api/v1/sheets", { method: "POST", form: sheetForm({ title: "x" }, { bytes: zip(["word/document.xml"]), name: "noct.docx" }) });
  check("ZIP ที่ไม่มี [Content_Types].xml → 415", r.status === 415);
  r = await alice.req("/api/v1/sheets", { method: "POST", form: sheetForm({ title: "x" }, { bytes: new Uint8Array(), name: "empty.pdf" }) });
  check("ไฟล์ว่าง → 400 (ถือว่าไม่ได้แนบไฟล์)", r.status === 400);
  const big = new Uint8Array((MAX_MB + 1) * 1024 * 1024);
  big.set(new TextEncoder().encode("%PDF-"));
  r = await alice.req("/api/v1/sheets", { method: "POST", form: sheetForm({ title: "big" }, { bytes: big, name: "big.pdf" }) });
  check(`ไฟล์ ${MAX_MB + 1} MB (มี Content-Length) → 413`, r.status === 413, `got ${r.status}`);
  const stream = new ReadableStream({
    pull(controller) {
      controller.enqueue(new Uint8Array(1024 * 1024));
      if (++this.sent > MAX_MB + 2) controller.close();
    },
    sent: 0,
  });
  r = await alice.req("/api/v1/sheets", { method: "POST", body: stream, headers: { "Content-Type": "multipart/form-data; boundary=x" } });
  check("body ใหญ่เกินแบบ chunked (ไม่มี Content-Length) → 413", r.status === 413, `got ${r.status}`);
  r = await alice.req("/api/v1/sheets", { method: "POST", body: "title=x", headers: { "Content-Type": "text/plain" } });
  check("Content-Type ไม่รองรับ → 400", r.status === 400);

  // ----------------------------------------------------------------- Upload: every type + Download
  group("Upload + Download ทุกชนิดไฟล์");
  const created = {};
  for (const [key, file] of Object.entries(FILES)) {
    const title = `สรุป ${key.toUpperCase()} ${RUN}`;
    r = await alice.req("/api/v1/sheets", {
      method: "POST",
      form: sheetForm({ title, description: `ไฟล์ทดสอบ ${key}`, subjectId: math.id, categoryId: summaryCat.id }, file),
    });
    const sheet = r.json?.data;
    created[key] = sheet;
    check(`${key}: อัปโหลด → 201`, r.status === 201, `got ${r.status} ${JSON.stringify(r.json?.error ?? "")}`);
    if (!sheet) continue;
    check(`${key}: mimeType = ${file.mime}`, sheet.file?.mimeType === file.mime, `got ${sheet.file?.mimeType}`);
    check(`${key}: sizeBytes ถูกต้อง`, sheet.file?.sizeBytes === file.bytes.length);
    check(`${key}: previewUrl ${file.preview ? "มี" : "เป็น null"}`, !!sheet.previewUrl === file.preview);
    check(`${key}: response ไม่มี storage_key`, !JSON.stringify(sheet).toLowerCase().includes("storage"));

    const dl = await guest.req(sheet.downloadUrl);
    check(`${key}: ดาวน์โหลด → 200 ไฟล์ตรงต้นฉบับทุก byte`, dl.status === 200 && sha(dl.bytes) === sha(file.bytes));
    check(`${key}: Content-Type`, dl.headers.get("content-type") === file.mime);
    // Next.js may drop Content-Length (sends chunked); when present it must be right, and the bytes must match.
    const length = dl.headers.get("content-length");
    check(`${key}: ขนาดที่ได้รับ = ขนาดไฟล์`, dl.bytes.length === file.bytes.length && (length === null || length === String(file.bytes.length)));
    check(`${key}: nosniff + no-store`, dl.headers.get("x-content-type-options") === "nosniff" && dl.headers.get("cache-control")?.includes("no-store"));
    const disp = dl.headers.get("content-disposition") ?? "";
    check(`${key}: ดาวน์โหลดเป็น attachment`, disp.startsWith("attachment"));
    check(`${key}: ชื่อไฟล์ = ชื่อชีท + ${file.ext}`, decodeFileName(disp) === title + file.ext, decodeFileName(disp));
    const inline = await guest.req(`${sheet.downloadUrl}?inline=1`);
    const inlineDisp = inline.headers.get("content-disposition") ?? "";
    check(
      `${key}: ?inline=1 → ${file.preview ? "inline" : "ยังเป็น attachment"}`,
      inlineDisp.startsWith(file.preview ? "inline" : "attachment"),
    );
  }

  // ----------------------------------------------------------------- Comment / Reply / Reaction + database relationships
  group("Comments / Replies / Reactions");
  const commentSheet = created.pdf;
  const secondSheet = created.png;
  if (!commentSheet?.id || !secondSheet?.id) {
    check("interaction prerequisites: uploaded sheets", false);
  } else {
    r = await guest.req("/api/v1/sheets/" + commentSheet.id + "/comments");
    check("guest reads comments on a published sheet", r.status === 200 && Array.isArray(r.json?.data));
    r = await guest.req("/api/v1/sheets/" + commentSheet.id + "/comments", { method: "POST", json: { body: "guest comment" } });
    check("guest cannot post a comment", r.status === 401);

    r = await alice.req("/api/v1/sheets/" + commentSheet.id + "/comments", { method: "POST", json: { body: "root comment " + RUN } });
    const rootComment = r.json?.data;
    check("signed-in user creates a top-level comment", r.status === 201 && !!rootComment?.id);
    r = await bob.req("/api/v1/comments/" + rootComment?.id + "/replies", { method: "POST", json: { body: "reply " + RUN } });
    const replyComment = r.json?.data;
    check("another user replies to the root comment", r.status === 201 && replyComment?.parentCommentId === rootComment?.id);
    r = await alice.req("/api/v1/comments/" + replyComment?.id + "/replies", { method: "POST", json: { body: "nested reply" } });
    check("reply-to-reply is rejected (one reply level)", r.status === 404);

    r = await guest.req("/api/v1/sheets/" + commentSheet.id + "/comments");
    const visibleRoot = r.json?.data?.find((comment) => comment.id === rootComment?.id);
    check("comment list nests replies under the correct parent", !!visibleRoot && visibleRoot.replies?.length === 1 && visibleRoot.replies[0].id === replyComment?.id);
    r = await bob.req("/api/v1/comments/" + rootComment?.id, { method: "DELETE" });
    check("a different user cannot delete the comment", r.status === 404);
    r = await alice.req("/api/v1/comments/" + rootComment?.id, { method: "DELETE" });
    check("author soft-deletes their comment", r.status === 200 && r.json?.data?.deleted === true);
    r = await guest.req("/api/v1/sheets/" + commentSheet.id + "/comments");
    const deletedRoot = r.json?.data?.find((comment) => comment.id === rootComment?.id);
    check("deleted parent remains as a placeholder so replies retain context", deletedRoot?.deleted === true && deletedRoot.body === "" && deletedRoot.replies?.length === 1);

    const [aliceRow] = await sql.unsafe('select id from "user" where email = $1', [emailA]);
    let crossSheetFkCode = null;
    try {
      await sql.unsafe(
        "insert into comments (id, sheet_id, author_id, parent_comment_id, body) values ($1, $2, $3, $4, $5)",
        [randomUUID(), secondSheet.id, aliceRow.id, rootComment.id, "cross-sheet reply"],
      );
    } catch (error) {
      crossSheetFkCode = error.code;
    }
    check("database FK rejects a reply whose parent belongs to another sheet", crossSheetFkCode === "23503");

    r = await guest.req("/api/v1/sheets/" + commentSheet.id + "/reactions", { method: "POST", json: { reaction: "like" } });
    check("guest cannot react", r.status === 401);
    r = await alice.req("/api/v1/sheets/" + commentSheet.id + "/reactions", { method: "POST", json: { reaction: "like" } });
    check("signed-in user likes a sheet", r.status === 200 && r.json?.data?.reaction === "like");
    r = await alice.req("/api/v1/sheets/" + commentSheet.id + "/reactions", { method: "POST", json: { reaction: "like" } });
    const [likeRows] = await sql.unsafe("select count(*)::int as count from sheet_reactions where user_id = $1 and sheet_id = $2", [aliceRow.id, commentSheet.id]);
    check("repeating Like does not create a duplicate row", r.status === 200 && likeRows.count === 1);
    r = await alice.req("/api/v1/sheets/" + commentSheet.id + "/reactions", { method: "POST", json: { reaction: "dislike" } });
    const [changedReaction] = await sql.unsafe("select count(*)::int as count, max(reaction) as reaction from sheet_reactions where user_id = $1 and sheet_id = $2", [aliceRow.id, commentSheet.id]);
    check("Like changes to Dislike on the same row", r.status === 200 && r.json?.data?.reaction === "dislike" && changedReaction.count === 1 && changedReaction.reaction === "dislike");
    r = await alice.req("/api/v1/sheets/" + commentSheet.id + "/reactions", { method: "DELETE" });
    const [remainingReactions] = await sql.unsafe("select count(*)::int as count from sheet_reactions where user_id = $1 and sheet_id = $2", [aliceRow.id, commentSheet.id]);
    check("user can remove their reaction", r.status === 200 && remainingReactions.count === 0);
    r = await alice.req("/api/v1/sheets/" + commentSheet.id + "/reactions", { method: "POST", json: { reaction: "clap" } });
    check("invalid reaction values are rejected", r.status === 400);
    let duplicateReactionCode = null;
    await sql.unsafe("insert into sheet_reactions (user_id, sheet_id, reaction) values ($1, $2, $3)", [aliceRow.id, commentSheet.id, "like"]);
    try {
      await sql.unsafe("insert into sheet_reactions (user_id, sheet_id, reaction) values ($1, $2, $3)", [aliceRow.id, commentSheet.id, "dislike"]);
    } catch (error) {
      duplicateReactionCode = error.code;
    }
    await sql.unsafe("delete from sheet_reactions where user_id = $1 and sheet_id = $2", [aliceRow.id, commentSheet.id]);
    check("database primary key rejects a second reaction row for the same user and sheet", duplicateReactionCode === "23505");
  }
  // ----------------------------------------------------------------- Favorites / Collections / Reports — success + error cases
  group("Favorites / Collections / Reports");
  const [favoriteOwner] = await sql.unsafe('select id from "user" where email = $1', [emailA]);
  r = await guest.req("/api/v1/favorites");
  check("guest cannot list favorites", r.status === 401);
  r = await guest.req("/api/v1/favorites/" + commentSheet.id, { method: "POST" });
  check("guest cannot add a favorite", r.status === 401);
  r = await alice.req("/api/v1/favorites/" + commentSheet.id, { method: "POST" });
  check("signed-in user adds a favorite", r.status === 201 && r.json?.data?.favorited === true);
  r = await alice.req("/api/v1/favorites/" + commentSheet.id, { method: "POST" });
  const [favoriteRows] = await sql.unsafe("select count(*)::int as count from favorites where user_id = $1 and sheet_id = $2", [favoriteOwner.id, commentSheet.id]);
  check("adding the same favorite twice keeps one row", r.status === 201 && favoriteRows.count === 1);
  r = await alice.req("/api/v1/favorites");
  check("favorite list returns the selected sheet", r.status === 200 && r.json?.data?.some((item) => item.id === commentSheet.id));
  r = await bob.req("/api/v1/favorites/" + commentSheet.id, { method: "DELETE" });
  const [stillFavorited] = await sql.unsafe("select count(*)::int as count from favorites where user_id = $1 and sheet_id = $2", [favoriteOwner.id, commentSheet.id]);
  check("a user can only remove their own favorite", r.status === 200 && stillFavorited.count === 1);
  r = await alice.req("/api/v1/favorites/" + commentSheet.id, { method: "DELETE" });
  check("user removes a favorite", r.status === 200 && r.json?.data?.favorited === false);
  check("invalid favorite sheet id returns 404", (await alice.req("/api/v1/favorites/not-a-uuid", { method: "POST" })).status === 404);
  check("unknown favorite sheet returns 404", (await alice.req("/api/v1/favorites/00000000-0000-0000-0000-000000000000", { method: "POST" })).status === 404);

  r = await guest.req("/api/v1/collections");
  check("guest cannot list collections", r.status === 401);
  r = await alice.req("/api/v1/collections", { method: "POST", json: { name: "   " } });
  check("blank collection name is rejected", r.status === 400);
  r = await alice.req("/api/v1/collections", { method: "POST", json: { name: `Smoke ${RUN}`, description: "BE02 smoke test", isPublic: false } });
  const collection = r.json?.data;
  check("signed-in user creates a collection", r.status === 201 && !!collection?.id);
  r = await alice.req("/api/v1/collections", { method: "POST", json: { name: `Smoke ${RUN}` } });
  check("duplicate collection name is rejected", r.status === 409);
  r = await alice.req("/api/v1/collections");
  check("collection list includes the new collection", r.status === 200 && r.json?.data?.some((item) => item.id === collection?.id));
  r = await alice.req(`/api/v1/collections/${collection?.id}/sheets`, { method: "POST", json: { sheetId: commentSheet.id } });
  check("owner adds a sheet to collection", r.status === 201);
  r = await alice.req(`/api/v1/collections/${collection?.id}/sheets`, { method: "POST", json: { sheetId: commentSheet.id } });
  const [collectionRows] = await sql.unsafe("select count(*)::int as count from collection_items where collection_id = $1 and sheet_id = $2", [collection.id, commentSheet.id]);
  check("adding the same sheet twice keeps one collection item", r.status === 201 && collectionRows.count === 1);
  r = await alice.req(`/api/v1/collections/${collection.id}/sheets`);
  check("collection sheet list returns the added sheet", r.status === 200 && r.json?.data?.some((item) => item.id === commentSheet.id));
  r = await bob.req(`/api/v1/collections/${collection.id}/sheets`, { method: "POST", json: { sheetId: secondSheet.id } });
  check("another user cannot add to a private collection", r.status === 404);
  r = await bob.req(`/api/v1/collections/${collection.id}/sheets/${commentSheet.id}`, { method: "DELETE" });
  check("another user cannot remove from a collection", r.status === 404);
  r = await alice.req(`/api/v1/collections/${collection.id}/sheets/${commentSheet.id}`, { method: "DELETE" });
  check("owner removes a sheet from collection", r.status === 200 && r.json?.data?.removed === true);
  r = await alice.req(`/api/v1/collections/${collection.id}/sheets/${commentSheet.id}`, { method: "DELETE" });
  check("removing a missing collection item returns 404", r.status === 404);
  check("invalid collection id returns 404", (await alice.req("/api/v1/collections/not-a-uuid/sheets")).status === 404);
  check("invalid collection sheet id returns 404", (await alice.req(`/api/v1/collections/${collection.id}/sheets/not-a-uuid`, { method: "DELETE" })).status === 404);

  r = await guest.req(`/api/v1/sheets/${secondSheet.id}/reports`, { method: "POST", json: { reason: "spam" } });
  check("guest cannot report a sheet", r.status === 401);
  r = await bob.req(`/api/v1/sheets/${secondSheet.id}/reports`, { method: "POST", json: { reason: "spam", details: `Smoke ${RUN}` } });
  const report = r.json?.data;
  check("signed-in user reports a sheet", r.status === 201 && report?.reason === "spam" && report?.status === "open");
  r = await bob.req(`/api/v1/sheets/${secondSheet.id}/reports`, { method: "POST", json: { reason: "spam" } });
  check("duplicate report by same user is rejected", r.status === 409);
  r = await alice.req(`/api/v1/sheets/${commentSheet.id}/reports`, { method: "POST", json: { reason: "not-a-reason" } });
  check("invalid report reason is rejected", r.status === 400);
  r = await alice.req(`/api/v1/sheets/${commentSheet.id}/reports`, { method: "POST", json: { reason: "other", details: "x".repeat(2001) } });
  check("overlong report details are rejected", r.status === 400);
  r = await alice.req("/api/v1/sheets/not-a-uuid/reports", { method: "POST", json: { reason: "spam" } });
  check("invalid report sheet id returns 404", r.status === 404);
  // ----------------------------------------------------------------- BE02 response contract: { data } or { error: { code, message } }
  group("BE02 Response format");
  const responseCases = [];
  let shapeResponse = await guest.req(`/api/v1/sheets/${commentSheet.id}/comments`);
  responseCases.push(["GET comments success", shapeResponse, "success"]);
  shapeResponse = await guest.req(`/api/v1/sheets/${commentSheet.id}/comments`, { method: "POST", json: { body: "guest" } });
  responseCases.push(["POST comments unauthorized", shapeResponse, "error"]);
  shapeResponse = await alice.req(`/api/v1/sheets/${commentSheet.id}/comments`, { method: "POST", json: { body: `Shape comment ${RUN}` } });
  const shapeComment = shapeResponse.json?.data;
  responseCases.push(["POST comments success", shapeResponse, "success"]);
  shapeResponse = await bob.req(`/api/v1/comments/${shapeComment?.id}/replies`, { method: "POST", json: { body: `Shape reply ${RUN}` } });
  responseCases.push(["POST reply success", shapeResponse, "success"]);
  shapeResponse = await alice.req(`/api/v1/comments/${shapeComment?.id}`, { method: "DELETE" });
  responseCases.push(["DELETE comment success", shapeResponse, "success"]);
  shapeResponse = await alice.req(`/api/v1/sheets/${commentSheet.id}/reactions`, { method: "POST", json: { reaction: "like" } });
  responseCases.push(["POST reaction success", shapeResponse, "success"]);
  shapeResponse = await alice.req(`/api/v1/sheets/${commentSheet.id}/reactions`, { method: "POST", json: { reaction: "invalid" } });
  responseCases.push(["POST reaction validation error", shapeResponse, "error"]);
  shapeResponse = await alice.req(`/api/v1/sheets/${commentSheet.id}/reactions`, { method: "DELETE" });
  responseCases.push(["DELETE reaction success", shapeResponse, "success"]);
  shapeResponse = await guest.req("/api/v1/favorites");
  responseCases.push(["GET favorites unauthorized", shapeResponse, "error"]);
  shapeResponse = await alice.req("/api/v1/favorites");
  responseCases.push(["GET favorites success", shapeResponse, "success"]);
  shapeResponse = await alice.req(`/api/v1/favorites/${commentSheet.id}`, { method: "POST" });
  responseCases.push(["POST favorite success", shapeResponse, "success"]);
  shapeResponse = await alice.req(`/api/v1/favorites/${commentSheet.id}`, { method: "DELETE" });
  responseCases.push(["DELETE favorite success", shapeResponse, "success"]);
  shapeResponse = await alice.req("/api/v1/collections", { method: "POST", json: { name: " " } });
  responseCases.push(["POST collection validation error", shapeResponse, "error"]);
  shapeResponse = await alice.req("/api/v1/collections", { method: "POST", json: { name: `Response ${RUN}` } });
  const shapeCollection = shapeResponse.json?.data;
  responseCases.push(["POST collection success", shapeResponse, "success"]);
  shapeResponse = await alice.req(`/api/v1/collections/${shapeCollection?.id}/sheets`, { method: "POST", json: { sheetId: commentSheet.id } });
  responseCases.push(["POST collection sheet success", shapeResponse, "success"]);
  shapeResponse = await alice.req(`/api/v1/collections/${shapeCollection?.id}/sheets`);
  responseCases.push(["GET collection sheets success", shapeResponse, "success"]);
  shapeResponse = await alice.req(`/api/v1/collections/${shapeCollection?.id}/sheets/${commentSheet.id}`, { method: "DELETE" });
  responseCases.push(["DELETE collection sheet success", shapeResponse, "success"]);
  shapeResponse = await guest.req(`/api/v1/sheets/${commentSheet.id}/reports`, { method: "POST", json: { reason: "spam" } });
  responseCases.push(["POST report unauthorized", shapeResponse, "error"]);
  shapeResponse = await bob.req(`/api/v1/sheets/${commentSheet.id}/reports`, { method: "POST", json: { reason: "spam" } });
  responseCases.push(["POST report success", shapeResponse, "success"]);
  shapeResponse = await bob.req(`/api/v1/sheets/${commentSheet.id}/reports`, { method: "POST", json: { reason: "spam" } });
  responseCases.push(["POST duplicate report conflict", shapeResponse, "error"]);
  for (const [name, response, kind] of responseCases) {
    check(`${name} matches { ${kind === "success" ? "data" : "error: { code, message }"} }`, hasApiEnvelope(response, kind));
  }
  // file on disk matches DB
  const rows = await sql`select f.storage_key, f.size_bytes from sheet_files f join sheets s on s.id = f.sheet_id
    join "user" u on u.id = s.owner_id where u.email = ${emailA}`;
  check("ทุกแถว sheet_files มีไฟล์จริงบนดิสก์", rows.every((row) => existsSync(path.join(UPLOAD_ROOT, row.storage_key))));

  // ----------------------------------------------------------------- Download: special cases
  group("Download — สิทธิ์และกรณีพิเศษ");
  r = await alice.req("/api/v1/sheets", { method: "POST", form: sheetForm({ title: 'ชื่อ/แปลก\\:*?"<>| ไฟล์' }, FILES.pdf) });
  const weird = r.json?.data;
  const wd = await guest.req(weird.downloadUrl);
  const weirdName = decodeFileName(wd.headers.get("content-disposition"));
  check("ตัวอักษรอันตรายในชื่อถูกแทนที่", !/[\\/:*?"<>|]/.test(weirdName) && weirdName.endsWith(".pdf"), weirdName);

  r = await alice.req("/api/v1/sheets", { method: "POST", form: sheetForm({ title: `ร่างมีไฟล์ ${RUN}`, status: "draft" }, FILES.png) });
  const draft = r.json?.data;
  check("สร้าง draft พร้อมไฟล์ → 201", r.status === 201 && draft?.status === "draft");
  check("ดาวน์โหลด draft: guest → 404", (await guest.req(draft.downloadUrl)).status === 404);
  check("ดาวน์โหลด draft: คนอื่น → 404", (await bob.req(draft.downloadUrl)).status === 404);
  check("ดาวน์โหลด draft: เจ้าของ → 200", (await alice.req(draft.downloadUrl)).status === 200);

  r = await alice.req("/api/v1/sheets", { method: "POST", form: sheetForm({ title: `ร่างไม่มีไฟล์ ${RUN}`, status: "draft" }) });
  const noFile = r.json?.data;
  check("สร้าง draft ไม่มีไฟล์ → 201, downloadUrl = null", r.status === 201 && noFile?.downloadUrl === null && noFile?.file === null);
  r = await alice.req(`/api/v1/sheets/${noFile.id}/download`);
  check("ดาวน์โหลดชีทที่ไม่มีไฟล์ → 404", r.status === 404);
  check("id ผิดรูปแบบ → 404", (await guest.req("/api/v1/sheets/abc/download")).status === 404);
  check("id ที่ไม่มีจริง → 404", (await guest.req("/api/v1/sheets/00000000-0000-0000-0000-000000000000/download")).status === 404);

  // new version
  const pdfSheet = created.pdf;
  const v2 = { ...FILES.pdf, bytes: pdf("version two") };
  r = await alice.req(`/api/v1/sheets/${pdfSheet.id}`, { method: "PATCH", form: sheetForm({}, v2) });
  check("PATCH ไฟล์ใหม่ → v2", r.status === 200 && r.json?.data?.file?.versionNo === 2, JSON.stringify(r.json?.error ?? ""));
  const dl2 = await guest.req(pdfSheet.downloadUrl);
  check("ดาวน์โหลดได้ไฟล์ v2", sha(dl2.bytes) === sha(v2.bytes));
  const versions = await sql`select version_no, storage_key from sheet_files where sheet_id = ${pdfSheet.id} order by version_no`;
  check("DB มี 2 เวอร์ชัน และไฟล์ v1 ยังอยู่บนดิสก์", versions.length === 2 && existsSync(path.join(UPLOAD_ROOT, versions[0].storage_key)));
  r = await bob.req(`/api/v1/sheets/${pdfSheet.id}`, { method: "PATCH", form: sheetForm({}, FILES.png) });
  check("คนอื่นเปลี่ยนไฟล์ไม่ได้ → 403", r.status === 403);

  // missing on disk
  const [gifRow] = await sql`select storage_key from sheet_files where sheet_id = ${created.gif.id}`;
  await rm(path.join(UPLOAD_ROOT, gifRow.storage_key));
  r = await guest.req(created.gif.downloadUrl);
  check("ไฟล์หายจากดิสก์ → 404 (ไม่ใช่ 500)", r.status === 404, `got ${r.status}`);

  // hidden / deleted
  await alice.req(`/api/v1/sheets/${created.jpg.id}`, { method: "PATCH", json: { status: "hidden" } });
  check("ดาวน์โหลดชีทที่ซ่อน: guest → 404", (await guest.req(created.jpg.downloadUrl)).status === 404);
  check("ดาวน์โหลดชีทที่ซ่อน: เจ้าของ → 200", (await alice.req(created.jpg.downloadUrl)).status === 200);
  await alice.req(`/api/v1/sheets/${created.webp.id}`, { method: "DELETE" });
  check("ดาวน์โหลดชีทที่ลบแล้ว: เจ้าของ → 404", (await alice.req(created.webp.downloadUrl)).status === 404);

  // ----------------------------------------------------------------- List / Search / Filter
  group("List / Search / Filter / Pagination");
  r = await bob.req("/api/v1/sheets", { method: "POST", form: sheetForm({ title: `Physics derivative ${RUN}`, subjectId: physics.id }, FILES.png) });
  const bobSheet = r.json?.data;
  const list = async (qs) => (await guest.req(`/api/v1/sheets?${qs}`)).json;
  let res = await list(`q=${RUN}&pageSize=50`);
  const titles = res.data.map((s) => s.title);
  check("รายการไม่มี draft", !titles.includes(`ร่างมีไฟล์ ${RUN}`) && !titles.includes(`ร่างไม่มีไฟล์ ${RUN}`));
  check("รายการไม่มีชีทที่ซ่อน/ลบ", !titles.includes(`สรุป JPG ${RUN}`) && !titles.includes(`สรุป WEBP ${RUN}`));
  check("ทุกรายการ status = published", res.data.every((s) => s.status === "published"));
  res = await list(`q=${RUN}&pageSize=2&page=2`);
  check("pagination: pageSize=2 หน้า 2", res.data.length === 2 && res.pagination.page === 2 && res.pagination.totalPages >= 3);
  res = await list(`q=${RUN}&pageSize=999`);
  check("pageSize สูงสุด 50", res.pagination.pageSize === 50);
  res = await list(`q=derivative%20${RUN}`);
  check("ค้นภาษาอังกฤษ (full-text)", res.data.some((s) => s.id === bobSheet.id));
  res = await list(`q=${encodeURIComponent("รุป PPT")}&pageSize=50`);
  check("ค้นด้วยคำไทยบางส่วน (ILIKE)", res.data.some((s) => s.id === created.pptx.id));
  res = await list(`q=${encodeURIComponent("%")}`);
  check("ค้น % ไม่กลายเป็น wildcard", !res.data.some((s) => s.title.includes(RUN)));
  res = await list(`q=${RUN}&subjectId=${physics.id}`);
  check("กรองวิชา", res.data.length === 1 && res.data[0].id === bobSheet.id);
  res = await list(`q=${RUN}&subjectId=${math.id}&categoryId=${summaryCat.id}&pageSize=50`);
  check("กรองวิชา + หมวดหมู่", res.data.length >= 5 && res.data.every((s) => s.subject?.id === math.id && s.category?.id === summaryCat.id));
  check("subjectId ผิดรูปแบบ → 400", (await guest.req("/api/v1/sheets?subjectId=abc")).status === 400);

  // ----------------------------------------------------------------- Detail / view count
  group("Detail / ยอดดู");
  const before = (await alice.req(`/api/v1/sheets/${bobSheet.id}`)).json.data;
  const after = (await guest.req(`/api/v1/sheets/${bobSheet.id}`)).json.data;
  check("คนอื่นเปิด → viewCount +1", after.viewCount === before.viewCount + 1);
  check("การเปิดดูไม่เปลี่ยน updatedAt", after.updatedAt === before.updatedAt);
  const own = (await bob.req(`/api/v1/sheets/${bobSheet.id}`)).json.data;
  check("เจ้าของเปิด → viewCount ไม่เพิ่ม และ isOwner = true", own.viewCount === after.viewCount && own.viewer.isOwner === true);
  check("คนอื่นเห็น isOwner = false", after.viewer.isOwner === false && after.viewer.reaction === null);
  res = await list(`q=${RUN}&sort=popular`);
  check("sort=popular: ยอดดูมากสุดอยู่บน", res.data[0].id === bobSheet.id);
  check("detail draft: คนอื่น → 404", (await bob.req(`/api/v1/sheets/${draft.id}`)).status === 404);

  // ----------------------------------------------------------------- Edit / Delete
  group("Edit / Delete");
  const target = created.pptx;
  r = await alice.req(`/api/v1/sheets/${target.id}`, { method: "PATCH", json: { title: "  แก้ชื่อแล้ว  ", subjectId: null, description: "" } });
  check("PATCH JSON → trim ชื่อ, ล้างวิชา, คำอธิบายว่าง = null",
    r.status === 200 && r.json.data.title === "แก้ชื่อแล้ว" && r.json.data.subject === null && r.json.data.description === null);
  check("PATCH เปลี่ยน updatedAt", r.json.data.updatedAt !== target.updatedAt);
  check("guest PATCH → 401", (await guest.req(`/api/v1/sheets/${target.id}`, { method: "PATCH", json: { title: "x" } })).status === 401);
  check("คนอื่น PATCH → 403", (await bob.req(`/api/v1/sheets/${target.id}`, { method: "PATCH", json: { title: "x" } })).status === 403);
  check("คนอื่น PATCH draft → 404", (await bob.req(`/api/v1/sheets/${draft.id}`, { method: "PATCH", json: { title: "x" } })).status === 404);
  check("body ว่าง → 400", (await alice.req(`/api/v1/sheets/${target.id}`, { method: "PATCH", json: {} })).status === 400);
  check("JSON เสีย → 400", (await alice.req(`/api/v1/sheets/${target.id}`, { method: "PATCH", json: "{bad" })).status === 400);
  check("title ว่าง → 400", (await alice.req(`/api/v1/sheets/${target.id}`, { method: "PATCH", json: { title: " " } })).status === 400);
  check("status ผิด → 400", (await alice.req(`/api/v1/sheets/${target.id}`, { method: "PATCH", json: { status: "public" } })).status === 400);
  check("เผยแพร่ draft ที่ไม่มีไฟล์ → 400",
    (await alice.req(`/api/v1/sheets/${noFile.id}`, { method: "PATCH", json: { status: "published" } })).status === 400);
  r = await alice.req(`/api/v1/sheets/${noFile.id}`, { method: "PATCH", form: sheetForm({ status: "published" }, FILES.pdf) });
  check("แนบไฟล์ + เผยแพร่ draft พร้อมกัน → 200", r.status === 200 && r.json.data.status === "published" && r.json.data.file?.versionNo === 1);
  check("คนอื่นลบ → 403", (await bob.req(`/api/v1/sheets/${target.id}`, { method: "DELETE" })).status === 403);
  check("เจ้าของลบ → 200", (await alice.req(`/api/v1/sheets/${target.id}`, { method: "DELETE" })).status === 200);
  check("ลบซ้ำ → 404", (await alice.req(`/api/v1/sheets/${target.id}`, { method: "DELETE" })).status === 404);
  const [softDeleted] = await sql`select deleted_at from sheets where id = ${target.id}`;
  check("soft delete: แถวยังอยู่ใน DB และมี deleted_at", !!softDeleted?.deleted_at);

  // ----------------------------------------------------------------- My Sheets
  group("My Sheets");
  r = await alice.req("/api/v1/users/me/sheets?pageSize=50");
  const mine = r.json?.data ?? [];
  check("เห็น draft และชีทที่ซ่อนของตัวเอง", mine.some((s) => s.id === draft.id) && mine.some((s) => s.id === created.jpg.id));
  check("ไม่เห็นชีทที่ลบแล้ว และไม่เห็นของคนอื่น",
    !mine.some((s) => s.id === target.id || s.id === created.webp.id) && mine.every((s) => s.owner.id !== bobSheet.owner.id));
  r = await alice.req("/api/v1/users/me/sheets?status=draft");
  check("กรอง status=draft", r.json.data.length > 0 && r.json.data.every((s) => s.status === "draft"));
  check("status ผิด → 400", (await alice.req("/api/v1/users/me/sheets?status=x")).status === 400);
  check("guest → 401", (await guest.req("/api/v1/users/me/sheets")).status === 401);

  // ----------------------------------------------------------------- Orphan files
  group("ไฟล์กำพร้า");
  const users = await sql`select id from "user" where email in ${sql(RUN_EMAILS)}`;
  const sheetIds = (await sql`select id from sheets where owner_id in ${sql(users.map((u) => u.id))}`).map((s) => s.id);
  const dbKeys = new Set((await sql`select storage_key from sheet_files where sheet_id in ${sql(sheetIds)}`).map((k) => k.storage_key));
  const diskKeys = [];
  for (const id of sheetIds) {
    const dir = path.join(UPLOAD_ROOT, "sheets", id);
    if (existsSync(dir)) for (const f of await readdir(dir)) diskKeys.push(`sheets/${id}/${f}`);
  }
  check("ทุกไฟล์บนดิสก์มีแถวใน DB (ไม่มีไฟล์จากอัปโหลดที่ล้มเหลว)", diskKeys.every((k) => dbKeys.has(k)), `disk=${diskKeys.length} db=${dbKeys.size}`);

  return { users: users.map((u) => u.id), sheetIds };
}

// ---------------------------------------------------------------------------
// Delete ONLY the accounts this run created (exact emails with this run's id), never other people's data —
// another teammate may be running the smoke test against the same database at the same time.
async function cleanup() {
  const users = await sql`select id from "user" where email in ${sql(RUN_EMAILS)}`;
  if (users.length === 0) return;
  const ids = users.map((u) => u.id);
  const sheets = await sql`delete from sheets where owner_id in ${sql(ids)} returning id`;
  await sql`delete from "user" where id in ${sql(ids)}`;
  for (const { id } of sheets) await rm(path.join(UPLOAD_ROOT, "sheets", id), { recursive: true, force: true });
  console.log(`\n(ลบข้อมูลทดสอบ: ผู้ใช้ ${users.length} คน, ชีท ${sheets.length} รายการ)`);
}

try {
  await main();
} catch (error) {
  failures.push(`ทดสอบหยุดกลางคัน: ${error.stack ?? error}`);
  console.error(error);
} finally {
  await cleanup().catch((e) => console.error("cleanup failed", e));
  await sql.end();
  console.log(`\nผลรวม: ผ่าน ${passed} / ไม่ผ่าน ${failures.length}`);
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exitCode = failures.length ? 1 : 0;
}
