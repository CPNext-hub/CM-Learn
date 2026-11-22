"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import Icon from "@/components/ui/Icon";
import {
  api,
  errorText,
  fileLabel,
  jsonInit,
  loadLookups,
  SHEET_ACCEPT,
  SHEET_MAX_BYTES,
  type Lookup,
  type Sheet,
  type SheetStatus,
} from "@/lib/api-client";

// Edit → GET /api/v1/sheets/:id, PATCH /api/v1/sheets/:id (JSON, or FormData when a new file is attached)
export default function EditSheetPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [subjects, setSubjects] = useState<Lookup[]>([]);
  const [categories, setCategories] = useState<Lookup[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<SheetStatus>("published");
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadLookups().then(({ subjects, categories }) => {
      setSubjects(subjects);
      setCategories(categories);
    });
    api<Sheet>(`/api/v1/sheets/${id}`).then((result) => {
      if (!result.ok) {
        if (result.status === 401) router.replace("/login");
        else setError(errorText(result.error));
        return;
      }
      if (!result.data.viewer?.isOwner) {
        setError("คุณไม่มีสิทธิ์แก้ไขชีตนี้");
        return;
      }
      setSheet(result.data);
      setStatus(result.data.status);
    });
  }, [id, router]);

  const pickFile = (selected: File | null) => {
    setError("");
    if (selected && selected.size > SHEET_MAX_BYTES) return setError("ไฟล์ต้องมีขนาดไม่เกิน 50 MB");
    setFile(selected);
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!sheet) return;
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const fields = {
      title: String(form.get("title") ?? ""),
      description: String(form.get("description") ?? ""),
      subjectId: String(form.get("subjectId") ?? "") || null,
      categoryId: String(form.get("categoryId") ?? "") || null,
      status,
    };

    let init: RequestInit;
    if (file) {
      // A new file → multipart (creates a new file version). Empty strings clear subject/category.
      const body = new FormData();
      for (const [key, value] of Object.entries(fields)) body.set(key, value ?? "");
      body.set("file", file);
      init = { method: "PATCH", body };
    } else {
      init = jsonInit("PATCH", fields);
    }

    const result = await api<Sheet>(`/api/v1/sheets/${id}`, init);
    setBusy(false);
    if (result.ok) router.push("/my-sheets");
    else if (result.status === 401) router.replace("/login");
    else setError(errorText(result.error));
  };

  const previewHref = sheet?.previewUrl ?? sheet?.downloadUrl;

  return (
    <main className="site-frame">
      <Navbar active="sheets" />
      <section className="page-surface">
        <div className="section-heading">
          <h1 className="section-title">
            <Link className="back-icon-button" href="/my-sheets" aria-label="กลับไปชีตของฉัน"><Icon name="arrow-left" size={20} /></Link>
            <span>แก้ไขชีต<small>ปรับรายละเอียดและการเผยแพร่ชีตของคุณ</small></span>
          </h1>
          <div style={{ display: "flex", gap: 8 }}>
            {previewHref && <a className="secondary-button" href={previewHref} target="_blank" rel="noreferrer"><Icon name="eye" size={15} /> ดูตัวอย่าง</a>}
            <button className="action-button" type="submit" form="edit-sheet-form" disabled={busy || !sheet}><Icon name="save" size={15} /> บันทึกการเปลี่ยนแปลง</button>
          </div>
        </div>
        {error && <p className="auth-error" role="alert">{error}</p>}
        {!sheet && !error && <div className="empty-state">กำลังโหลดข้อมูลชีต...</div>}
        {sheet && (
          <form id="edit-sheet-form" onSubmit={save} className="edit-layout">
            <aside className="edit-file">
              <div className="pdf-preview"><div className="pdf-icon"><span>{sheet.file ? fileLabel(sheet.file.mimeType) : "ไม่มีไฟล์"}</span></div></div>
              <button className="secondary-button" type="button" onClick={() => fileInput.current?.click()}><Icon name="cloud-upload" size={15} /> {file?.name ?? (sheet.file ? "เปลี่ยนไฟล์" : "แนบไฟล์")}</button>
              <input ref={fileInput} type="file" accept={SHEET_ACCEPT} hidden onChange={(event) => pickFile(event.target.files?.[0] ?? null)} />
              <small style={{ color: "#8b97a9", textAlign: "center" }}>
                {sheet.file ? `เวอร์ชันปัจจุบัน v${sheet.file.versionNo} · ` : ""}รองรับ PDF, รูปภาพ, DOCX, PPTX, XLSX ไม่เกิน 50 MB
              </small>
            </aside>
            <section className="edit-fields">
              <label htmlFor="sheet-title">ชื่อชีต *</label>
              <input id="sheet-title" name="title" defaultValue={sheet.title} maxLength={200} required />
              <label htmlFor="sheet-description">คำอธิบาย</label>
              <textarea id="sheet-description" name="description" defaultValue={sheet.description ?? ""} maxLength={5000} />
              <label htmlFor="sheet-subject">วิชา</label>
              <select id="sheet-subject" name="subjectId" defaultValue={sheet.subject?.id ?? ""} key={`s${subjects.length}`}>
                <option value="">ไม่ระบุ</option>
                {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <label htmlFor="sheet-category">หมวดหมู่</label>
              <select id="sheet-category" name="categoryId" defaultValue={sheet.category?.id ?? ""} key={`c${categories.length}`}>
                <option value="">ไม่ระบุ</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <label>การตั้งค่าการมองเห็น</label>
              <div className="radio-list">
                <label><input type="radio" name="status-choice" checked={status === "published"} onChange={() => setStatus("published")} /> เผยแพร่ (ทุกคนค้นหาและดูได้)</label>
                <label><input type="radio" name="status-choice" checked={status === "draft"} onChange={() => setStatus("draft")} /> ร่าง (เห็นเฉพาะคุณ)</label>
                <label><input type="radio" name="status-choice" checked={status === "hidden"} onChange={() => setStatus("hidden")} /> ซ่อน (เอาออกจากหน้าสาธารณะชั่วคราว)</label>
              </div>
              <div className="edit-actions">
                <Link className="secondary-button" href="/my-sheets"><Icon name="arrow-left" size={14} /> ยกเลิก</Link>
                <button className="action-button" type="submit" disabled={busy}><Icon name="save" size={15} /> {busy ? "กำลังบันทึก..." : "บันทึกการเปลี่ยนแปลง"}</button>
              </div>
            </section>
          </form>
        )}
      </section>
      <Footer />
    </main>
  );
}
