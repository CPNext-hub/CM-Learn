// Tests for file validation and local storage. All filesystem writes stay under a temp folder.
import { afterAll, afterEach, beforeAll, expect, test, vi } from "vitest";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import {
  docxBytes,
  fakePdfFile,
  file,
  gifBytes,
  jpegBytes,
  pdfBytes,
  plainZipBytes,
  pngBytes,
  pptxBytes,
  webpBytes,
  xlsxBytes,
  zipBytes,
} from "../helpers/files";

let storage: typeof import("@/lib/storage");
let uploadRoot = "";
const originalUploadDir = process.env.UPLOAD_DIR;

beforeAll(async () => {
  uploadRoot = await mkdtemp(path.join(tmpdir(), "cm-learn-storage-test-"));
  vi.stubEnv("UPLOAD_DIR", uploadRoot);
  storage = await import("@/lib/storage");
});

afterEach(async () => {
  await rm(uploadRoot, { recursive: true, force: true });
  await mkdir(uploadRoot, { recursive: true });
});

afterAll(async () => {
  await rm(uploadRoot, { recursive: true, force: true });
  vi.unstubAllEnvs();
  if (originalUploadDir !== undefined) process.env.UPLOAD_DIR = originalUploadDir;
});

const validate = (bytes: Uint8Array) => storage.validateUpload(file(bytes, "upload.bin"));

const officeCases = [
  { label: "DOCX", bytes: docxBytes(), mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ext: ".docx" },
  { label: "PPTX", bytes: pptxBytes(), mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation", ext: ".pptx" },
  { label: "XLSX", bytes: xlsxBytes(), mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ext: ".xlsx" },
];

test.each([
  { label: "PDF", bytes: pdfBytes(), mime: "application/pdf", ext: ".pdf" },
  { label: "PNG", bytes: pngBytes(), mime: "image/png", ext: ".png" },
  { label: "JPEG", bytes: jpegBytes(), mime: "image/jpeg", ext: ".jpg" },
  { label: "GIF", bytes: gifBytes(), mime: "image/gif", ext: ".gif" },
  { label: "WEBP", bytes: webpBytes(), mime: "image/webp", ext: ".webp" },
])("validateUpload → ตรวจ magic bytes ของ $label", async ({ bytes, mime, ext }) => {
  const result = await validate(bytes);
  expect(result.kind).toMatchObject({ mime, ext, inlineSafe: true });
});

test.each(officeCases)("validateUpload → ตรวจ ZIP layout ของ $label", async ({ bytes, mime, ext }) => {
  const result = await validate(bytes);
  expect(result.kind).toMatchObject({ mime, ext, inlineSafe: false });
});

test("validateUpload → ปฏิเสธไฟล์ว่าง", async () => {
  await expect(validate(new Uint8Array())).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
});

test("validateUpload → ปฏิเสธไฟล์ที่เกินขนาดกำหนด", async () => {
  const rules = { ...storage.AVATAR_RULES, maxBytes: 1 };
  await expect(storage.validateUpload(file(pdfBytes(), "sheet.pdf"), rules))
    .rejects.toMatchObject({ code: "FILE_TOO_LARGE" });
});

test("validateUpload → ปฏิเสธ content ปลอม แม้ชื่อไฟล์เป็น PDF", async () => {
  await expect(storage.validateUpload(fakePdfFile())).rejects.toMatchObject({ code: "UNSUPPORTED_FILE_TYPE" });
});

test("validateUpload → avatar rules ไม่รับ PDF", async () => {
  await expect(storage.validateUpload(file(pdfBytes(), "avatar.pdf"), storage.AVATAR_RULES))
    .rejects.toMatchObject({ code: "UNSUPPORTED_FILE_TYPE" });
  expect(storage.AVATAR_RULES.allowedLabel).toBe(".png, .jpg, .jpeg, .webp");
  expect(storage.AVATAR_MAX_BYTES).toBe(2 * 1024 * 1024);
});

test("kindForMime และ kindForExt → หา type ที่รู้จักและคืน undefined เมื่อไม่รู้จัก", () => {
  expect(storage.kindForMime("application/pdf")?.ext).toBe(".pdf");
  expect(storage.kindForMime("unknown/type")).toBeUndefined();
  expect(storage.kindForExt(".docx")?.mime).toContain("wordprocessingml");
  expect(storage.kindForExt(".exe")).toBeUndefined();
  expect(storage.ALLOWED_EXTENSIONS).toContain(".jpeg");
  expect(storage.MAX_UPLOAD_BYTES).toBeGreaterThan(0);
});

test("saveFile และ openFile → เก็บและอ่าน bytes กลับได้ใน temp folder", async () => {
  const bytes = pdfBytes();
  const validated = await validate(bytes);
  const key = await storage.saveFile("sheets/example", validated);
  expect(key).toMatch(/^sheets\/example\/[a-f0-9-]+\.pdf$/);

  const opened = await storage.openFile(key);
  expect(opened?.size).toBe(bytes.length);
  expect(Buffer.from(await new Response(opened!.stream).arrayBuffer())).toEqual(Buffer.from(bytes));
  expect(await readFile(path.join(uploadRoot, key))).toEqual(Buffer.from(bytes));
});

test("openFile → คืน null เมื่อไม่มีไฟล์", async () => {
  await expect(storage.openFile("sheets/missing.pdf")).resolves.toBeNull();
});

test("deleteFile → ลบไฟล์และลบซ้ำได้โดยไม่ error", async () => {
  const key = await storage.saveFile("sheets/example", await validate(pdfBytes()));
  await storage.deleteFile(key);
  await storage.deleteFile(key);
  await expect(storage.openFile(key)).resolves.toBeNull();
});

test("storage functions → ปฏิเสธ path traversal", async () => {
  const validated = await validate(pdfBytes());
  await expect(storage.saveFile("../outside", validated)).rejects.toThrow("Invalid storage key");
  await expect(storage.openFile("../outside/file.pdf")).rejects.toThrow("Invalid storage key");
  await expect(storage.deleteFile("../../outside/file.pdf")).rejects.toThrow("Invalid storage key");
});

test("validateUpload → ปฏิเสธ malformed ZIP และ ZIP ทั่วไป", async () => {
  const malformedZip = Uint8Array.from([0x50, 0x4b, 0x03, 0x04]);
  await expect(validate(malformedZip)).rejects.toMatchObject({ code: "UNSUPPORTED_FILE_TYPE" });
  await expect(validate(plainZipBytes())).rejects.toMatchObject({ code: "UNSUPPORTED_FILE_TYPE" });
});

test("validateUpload → ปฏิเสธ ZIP ที่ central directory เสีย", async () => {
  const bytes = Buffer.from(zipBytes({ "[Content_Types].xml": "types", "word/document.xml": "doc" }));
  const endOffset = bytes.length - 22;
  const centralOffset = bytes.readUInt32LE(endOffset + 16);
  bytes.writeUInt32LE(0, centralOffset);
  await expect(validate(bytes)).rejects.toMatchObject({ code: "UNSUPPORTED_FILE_TYPE" });
});

test("validateUpload → ปฏิเสธ ZIP ที่มี Content Types แต่ไม่มี document ของ Office", async () => {
  const bytes = zipBytes({ "[Content_Types].xml": "types", "custom/metadata.xml": "metadata" });
  await expect(validate(bytes)).rejects.toMatchObject({ code: "UNSUPPORTED_FILE_TYPE" });
});
