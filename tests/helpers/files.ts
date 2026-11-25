// Small but REAL sample files for upload tests (storage.ts checks the actual bytes, not the file name).
//
//   const form = sheetForm({ title: "สรุปแคลคูลัส", file: pdfFile() });
//   await POST(request("/api/v1/sheets", { method: "POST", form, cookie }));

const encoder = new TextEncoder();

export const pdfBytes = () =>
  encoder.encode(
    "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
      "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
  );

// 1x1 pixel images
export const pngBytes = () =>
  Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"));
export const jpegBytes = () => Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0xff, 0xd9]);
export const gifBytes = () => encoder.encode("GIF89a\x01\x00\x01\x00\x00\x00\x00;");
export const webpBytes = () => {
  const bytes = encoder.encode("RIFF\x1a\x00\x00\x00WEBPVP8L\x0d\x00\x00\x00\x2f\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00");
  return bytes;
};

// ---- ZIP / Office ----------------------------------------------------------

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(data: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** Builds a valid, uncompressed ZIP from { "path/in/zip": "content" }. */
export function zipBytes(entries: Record<string, string>): Uint8Array {
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(entries)) {
    const nameBytes = encoder.encode(name);
    const data = encoder.encode(content);
    const crc = crc32(data);

    const local = new Uint8Array(30 + nameBytes.length + data.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    local.set(data, 30 + nameBytes.length);

    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    central.set(nameBytes, 46);

    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }
  const centralSize = centrals.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, centrals.length, true);
  ev.setUint16(10, centrals.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);

  const out = new Uint8Array(offset + centralSize + end.length);
  let pos = 0;
  for (const part of [...locals, ...centrals, end]) {
    out.set(part, pos);
    pos += part.length;
  }
  return out;
}

const CONTENT_TYPES = { "[Content_Types].xml": '<?xml version="1.0"?><Types/>' };
export const docxBytes = () => zipBytes({ ...CONTENT_TYPES, "word/document.xml": "<w:document/>" });
export const pptxBytes = () => zipBytes({ ...CONTENT_TYPES, "ppt/presentation.xml": "<p:presentation/>" });
export const xlsxBytes = () => zipBytes({ ...CONTENT_TYPES, "xl/workbook.xml": "<workbook/>" });
/** A real ZIP that is NOT an Office document (should be rejected). */
export const plainZipBytes = () => zipBytes({ "notes.txt": "hello" });

// ---- File objects -------------------------------------------------------------

export const file = (bytes: Uint8Array, name: string, type = "") => new File([bytes as BlobPart], name, { type });
export const pdfFile = (name = "sheet.pdf") => file(pdfBytes(), name, "application/pdf");
export const pngFile = (name = "image.png") => file(pngBytes(), name, "image/png");
export const docxFile = (name = "notes.docx") => file(docxBytes(), name);
/** Text renamed to .pdf — the server must detect it is not a PDF (415). */
export const fakePdfFile = () => file(encoder.encode("<script>alert(1)</script>"), "evil.pdf", "application/pdf");
/** Larger than `megabytes` MB of zeros after a valid PDF header (for 413 tests). */
export const bigPdfFile = (megabytes: number) => {
  const bytes = new Uint8Array(Math.ceil(megabytes * 1024 * 1024) + 1);
  bytes.set(pdfBytes());
  return file(bytes, "big.pdf", "application/pdf");
};

/** FormData for POST/PATCH /api/v1/sheets. Only fields you pass are added. */
export function sheetForm(fields: {
  title?: string;
  description?: string;
  subjectId?: string;
  categoryId?: string;
  status?: string;
  file?: File;
}) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) form.append(key, value);
  }
  return form;
}
