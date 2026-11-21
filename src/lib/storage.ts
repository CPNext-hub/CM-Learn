import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { ApiError } from "@/lib/api";

// ---------------------------------------------------------------------------
// File storage (local disk for now).
// Every other file talks to storage ONLY through saveFile / openFile / deleteFile,
// so moving to Cloudflare R2 later means rewriting this one file.
// ---------------------------------------------------------------------------

const UPLOAD_ROOT = path.resolve(process.env.UPLOAD_DIR ?? "uploads");
const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB ?? 50);
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

type FileKind = { mime: string; ext: string; inlineSafe: boolean };

// Allowed types. `inlineSafe` = browser may display it directly (preview). Others are download-only.
const PDF: FileKind = { mime: "application/pdf", ext: ".pdf", inlineSafe: true };
const PNG: FileKind = { mime: "image/png", ext: ".png", inlineSafe: true };
const JPEG: FileKind = { mime: "image/jpeg", ext: ".jpg", inlineSafe: true };
const WEBP: FileKind = { mime: "image/webp", ext: ".webp", inlineSafe: true };
const GIF: FileKind = { mime: "image/gif", ext: ".gif", inlineSafe: true };
const DOCX: FileKind = {
  mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ext: ".docx",
  inlineSafe: false,
};
const PPTX: FileKind = {
  mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ext: ".pptx",
  inlineSafe: false,
};
const XLSX: FileKind = {
  mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ext: ".xlsx",
  inlineSafe: false,
};
const KINDS = [PDF, PNG, JPEG, WEBP, GIF, DOCX, PPTX, XLSX];

export const ALLOWED_EXTENSIONS = KINDS.map((k) => k.ext).concat(".jpeg");

const startsWith = (bytes: Uint8Array, signature: number[], offset = 0) =>
  signature.every((byte, i) => bytes[offset + i] === byte);

/**
 * Lists the file names inside a ZIP by reading its "central directory" (the table of contents at the end).
 * Returns null if the bytes are not a well-formed ZIP. No decompression needed: names are stored as plain text.
 */
function zipEntryNames(bytes: Uint8Array): Set<string> | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // The End Of Central Directory record (signature 0x06054b50) sits in the last 22..65557 bytes.
  const minEnd = Math.max(0, bytes.length - 65557);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= minEnd; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;

  const entryCount = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true); // where the central directory starts
  const names = new Set<string>();
  const decoder = new TextDecoder();
  for (let n = 0; n < entryCount; n++) {
    if (offset + 46 > bytes.length || view.getUint32(offset, true) !== 0x02014b50) return null;
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    if (offset + 46 + nameLength > bytes.length) return null;
    names.add(decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength)));
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return names;
}

/** docx/pptx/xlsx are ZIPs with a fixed internal layout; check for their required parts. */
function officeKind(bytes: Uint8Array): FileKind | null {
  const names = zipEntryNames(bytes);
  if (!names?.has("[Content_Types].xml")) return null; // every Office Open XML file has this
  if (names.has("word/document.xml")) return DOCX;
  if (names.has("ppt/presentation.xml")) return PPTX;
  if (names.has("xl/workbook.xml")) return XLSX;
  return null; // an ordinary ZIP, not an Office document
}

/**
 * Detects the REAL file type from its first bytes ("magic numbers").
 * We never trust the filename or the browser's Content-Type: a user can rename evil.html to notes.pdf.
 */
function sniff(bytes: Uint8Array): FileKind | null {
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return PDF; // "%PDF-"
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return PNG;
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return JPEG;
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) return GIF; // "GIF8"
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return WEBP;
  // docx/pptx/xlsx start like any ZIP ("PK\x03\x04"); look inside to tell which (the file name is not trusted).
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) return officeKind(bytes);
  return null;
}

export type ValidatedFile = { bytes: Uint8Array; kind: FileKind };

/** Checks size and real type of an uploaded file. Throws 400/413/415 ApiError. */
export async function validateUpload(file: File): Promise<ValidatedFile> {
  if (file.size === 0) throw new ApiError("VALIDATION_ERROR", "ไฟล์ว่างเปล่า", { file: "ไฟล์ว่างเปล่า" });
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new ApiError("FILE_TOO_LARGE", `ไฟล์ต้องมีขนาดไม่เกิน ${MAX_UPLOAD_MB} MB`);
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniff(bytes);
  if (!kind) {
    throw new ApiError(
      "UNSUPPORTED_FILE_TYPE",
      `รองรับเฉพาะไฟล์ ${ALLOWED_EXTENSIONS.join(", ")}`,
    );
  }
  return { bytes, kind };
}

export const kindForMime = (mime: string) => KINDS.find((k) => k.mime === mime);

/** Resolves a storage key to a path and refuses anything that escapes UPLOAD_ROOT (path traversal). */
function resolveKey(key: string): string {
  const fullPath = path.resolve(UPLOAD_ROOT, key);
  if (!fullPath.startsWith(UPLOAD_ROOT + path.sep)) throw new Error(`Invalid storage key: ${key}`);
  return fullPath;
}

/** Saves bytes and returns the generated storage key. The key is internal: never send it to clients. */
export async function saveFile(sheetId: string, file: ValidatedFile): Promise<string> {
  const key = `sheets/${sheetId}/${randomUUID()}${file.kind.ext}`;
  const fullPath = resolveKey(key);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, file.bytes, { flag: "wx" }); // wx = fail instead of overwriting
  return key;
}

/** Opens a stored file as a web stream, or null if it is missing on disk. */
export async function openFile(key: string): Promise<{ stream: ReadableStream; size: number } | null> {
  const fullPath = resolveKey(key);
  try {
    const info = await stat(fullPath);
    const stream = Readable.toWeb(createReadStream(fullPath)) as ReadableStream;
    return { stream, size: info.size };
  } catch {
    return null;
  }
}

/** Best-effort delete, used to clean up when the database insert fails after saving. */
export async function deleteFile(key: string): Promise<void> {
  await rm(resolveKey(key), { force: true });
}
