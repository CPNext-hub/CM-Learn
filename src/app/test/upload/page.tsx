"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { ErrorBox, FilePreview, LookupSelect, useLookups } from "../_components";
import { ACCEPT, api, formatBytes, type ApiErrorBody, type Sheet } from "../_lib";

type Draft = {
  form: FormData; // what will be sent on Confirm
  file: File | null;
  previewUrl: string | null; // local object URL: preview BEFORE anything is uploaded
  subjectName: string;
  categoryName: string;
};

// Upload → fill details → Preview → Confirm  →  POST /api/v1/sheets (multipart/form-data)
export default function TestUploadPage() {
  const { subjects, categories } = useLookups();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [created, setCreated] = useState<Sheet | null>(null);
  const [error, setError] = useState<{ body: ApiErrorBody; status: number } | null>(null);
  const [sending, setSending] = useState(false);

  // Free the local preview URL when it is replaced or the page closes.
  useEffect(() => () => void (draft?.previewUrl && URL.revokeObjectURL(draft.previewUrl)), [draft]);

  function handlePreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const file = form.get("file");
    const realFile = file instanceof File && file.size > 0 ? file : null;
    if (!realFile) form.delete("file");
    setError(null);
    setCreated(null);
    setDraft({
      form,
      file: realFile,
      previewUrl: realFile ? URL.createObjectURL(realFile) : null,
      subjectName: subjects.find((s) => s.id === form.get("subjectId"))?.name ?? "-",
      categoryName: categories.find((c) => c.id === form.get("categoryId"))?.name ?? "-",
    });
  }

  async function handleConfirm() {
    if (!draft) return;
    setSending(true);
    // Do NOT set Content-Type yourself: the browser adds the multipart boundary.
    const result = await api<Sheet>("/api/v1/sheets", { method: "POST", body: draft.form });
    setSending(false);
    if (result.ok) {
      setCreated(result.data);
      setDraft(null);
    } else {
      setError({ body: result.error, status: result.status });
    }
  }

  return (
    <main>
      <h1>อัปโหลดชีท</h1>

      <h2>1) เลือกไฟล์และกรอกรายละเอียด</h2>
      <form onSubmit={handlePreview}>
        <p>
          <label>
            ไฟล์ <input type="file" name="file" accept={ACCEPT} /> (PDF, รูป, DOCX, PPTX, XLSX ไม่เกิน 50 MB)
          </label>
        </p>
        <p>
          <label>
            ชื่อชีท* <input name="title" size={50} />
          </label>
        </p>
        <p>
          <label>
            คำอธิบาย
            <br />
            <textarea name="description" rows={3} cols={60} />
          </label>
        </p>
        <p>
          <LookupSelect name="subjectId" label="วิชา" options={subjects} />{" "}
          <LookupSelect name="categoryId" label="หมวดหมู่" options={categories} />
        </p>
        <p>
          <label>
            สถานะ{" "}
            <select name="status" defaultValue="published">
              <option value="published">เผยแพร่ทันที</option>
              <option value="draft">บันทึกเป็นร่าง</option>
            </select>
          </label>
        </p>
        <button type="submit">ดู Preview →</button>
      </form>

      {draft && (
        <section>
          <hr />
          <h2>2) ตรวจ Preview ก่อนยืนยัน</h2>
          <ul>
            <li>ชื่อ: {String(draft.form.get("title") || "(ว่าง)")}</li>
            <li>คำอธิบาย: {String(draft.form.get("description") || "-")}</li>
            <li>
              วิชา: {draft.subjectName} · หมวดหมู่: {draft.categoryName}
            </li>
            <li>สถานะ: {draft.form.get("status") === "draft" ? "ร่าง" : "เผยแพร่"}</li>
            <li>
              ไฟล์: {draft.file ? `${draft.file.name} (${draft.file.type || "?"}, ${formatBytes(draft.file.size)})` : "ไม่มี"}
            </li>
          </ul>
          {draft.file && <FilePreview url={draft.previewUrl} mimeType={draft.file.type} />}
          <p>
            <button type="button" onClick={handleConfirm} disabled={sending}>
              {sending ? "กำลังอัปโหลด..." : "✔ ยืนยันอัปโหลด"}
            </button>{" "}
            <button type="button" onClick={() => setDraft(null)} disabled={sending}>
              ยกเลิก
            </button>
          </p>
        </section>
      )}

      <ErrorBox error={error?.body ?? null} status={error?.status} />

      {created && (
        <p>
          ✅ อัปโหลดสำเร็จ (HTTP 201) — <Link href={`/test/sheets/${created.id}`}>เปิดชีท “{created.title}”</Link>
        </p>
      )}
    </main>
  );
}
