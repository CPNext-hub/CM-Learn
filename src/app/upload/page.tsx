"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import Icon from "@/components/ui/Icon";
import {
  api,
  errorText,
  fileLabel,
  loadLookups,
  SHEET_ACCEPT,
  SHEET_MAX_BYTES,
  sizeLabel,
  type Lookup,
  type Sheet,
} from "@/lib/api-client";

type Draft = { form: FormData; title: string; description: string; subject: string; category: string; publish: boolean };

// Upload → fill details → Preview → Confirm  (POST /api/v1/sheets)
export default function UploadPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [subjects, setSubjects] = useState<Lookup[]>([]);
  const [categories, setCategories] = useState<Lookup[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const titleRef = useRef<HTMLInputElement>(null);
  const subjectRef = useRef<HTMLSelectElement>(null);
  const categoryRef = useRef<HTMLSelectElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const [publish, setPublish] = useState(true);

  useEffect(() => {
    loadLookups().then(({ subjects, categories }) => {
      setSubjects(subjects);
      setCategories(categories);
    });
  }, []);

  // Local preview of the chosen file (nothing is uploaded yet). Freed when replaced or on leave.
  useEffect(() => () => void (previewUrl && URL.revokeObjectURL(previewUrl)), [previewUrl]);

  const pickFile = (selected: File | null) => {
    setError("");
    if (selected && selected.size > SHEET_MAX_BYTES) {
      setError("ไฟล์ต้องมีขนาดไม่เกิน 50 MB");
      return;
    }
    setFile(selected);
    setPreviewUrl(selected ? URL.createObjectURL(selected) : null);
  };

  // Step 1 → 2: check the form and open the preview.
  const openPreview = () => {
    setError("");
    const title = titleRef.current?.value.trim() ?? "";
    if (!title) return setError("กรุณากรอกชื่อชีต");
    if (publish && !file) return setError("กรุณาเลือกไฟล์ก่อนเผยแพร่ (หรือเลือก “บันทึกเป็นร่าง”)");

    const form = new FormData();
    form.set("title", title);
    form.set("description", descriptionRef.current?.value ?? "");
    form.set("subjectId", subjectRef.current?.value ?? "");
    form.set("categoryId", categoryRef.current?.value ?? "");
    form.set("status", publish ? "published" : "draft");
    if (file) form.set("file", file); // never set Content-Type yourself: the browser adds the multipart boundary
    setDraft({
      form,
      title,
      description: descriptionRef.current?.value.trim() ?? "",
      subject: subjects.find((s) => s.id === subjectRef.current?.value)?.name ?? "ไม่ระบุ",
      category: categories.find((c) => c.id === categoryRef.current?.value)?.name ?? "ไม่ระบุ",
      publish,
    });
  };

  // Step 2 → done: send it.
  const confirmUpload = async () => {
    if (!draft) return;
    setBusy(true);
    const result = await api<Sheet>("/api/v1/sheets", { method: "POST", body: draft.form });
    setBusy(false);
    if (result.ok) {
      router.push("/my-sheets");
      return;
    }
    if (result.status === 401) {
      router.push("/login");
      return;
    }
    setDraft(null);
    setError(errorText(result.error));
  };

  const isPdf = file?.type === "application/pdf";
  const isImage = file?.type.startsWith("image/");

  return (
    <main className="upload-frame">
      <Navbar active="upload" />
      <section className="upload-surface">
        <div className="section-heading upload-page-heading">
          <h1 className="section-title"><span className="folder-icon"><Icon name="cloud-upload" size={28} /></span><span>อัปโหลดชีตใหม่<small>แบ่งปันสรุปความรู้ของคุณกับชุมชน CM HUB</small></span></h1>
        </div>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <div className="upload-content">
          <label className="upload-dropzone" htmlFor="upload-file">
            <span className="upload-cloud"><Icon name="cloud-upload" size={40} /></span>
            <strong>{file ? file.name : "ลากไฟล์มาวางที่นี่"}</strong>
            <span>{file ? `${fileLabel(file.type)} · ${sizeLabel(file.size)}` : <>รองรับไฟล์ PDF, รูปภาพ, DOCX, PPTX, XLSX<br />ขนาดไม่เกิน 50 MB</>}</span>
            <span className="upload-pick"><Icon name="file" size={15} /> {file ? "เปลี่ยนไฟล์" : "เลือกไฟล์"}</span>
            <input id="upload-file" type="file" accept={SHEET_ACCEPT} onChange={(event) => pickFile(event.target.files?.[0] ?? null)} />
          </label>
          <div className="upload-form">
            <label htmlFor="upload-title">ชื่อชีต <b>*</b></label>
            <input id="upload-title" ref={titleRef} placeholder="เช่น สรุปเรื่อง JavaScript" maxLength={200} />
            <label htmlFor="upload-subject">วิชา</label>
            <select id="upload-subject" ref={subjectRef} defaultValue="">
              <option value="">เลือกวิชา (ไม่บังคับ)</option>
              {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <label htmlFor="upload-category">หมวดหมู่</label>
            <select id="upload-category" ref={categoryRef} defaultValue="">
              <option value="">เลือกหมวดหมู่ (ไม่บังคับ)</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <label htmlFor="upload-description">คำอธิบาย</label>
            <textarea id="upload-description" ref={descriptionRef} placeholder="อธิบายเนื้อหาในชีต..." maxLength={5000} />
            <div className="upload-tag-label">การเผยแพร่</div>
            <div className="radio-list">
              <label><input type="radio" name="publish" checked={publish} onChange={() => setPublish(true)} /> เผยแพร่ทันที (ทุกคนค้นหาและดูได้)</label>
              <label><input type="radio" name="publish" checked={!publish} onChange={() => setPublish(false)} /> บันทึกเป็นร่าง (เห็นเฉพาะคุณ)</label>
            </div>
            <div className="upload-submit"><button type="button" onClick={openPreview}><Icon name="eye" size={16} /> ดูตัวอย่างก่อนอัปโหลด</button></div>
          </div>
        </div>
      </section>

      {draft && (
        <div className="confirm-backdrop" onMouseDown={() => !busy && setDraft(null)}>
          <section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="preview-title" onMouseDown={(event) => event.stopPropagation()} style={{ width: "min(720px, calc(100vw - 32px))", maxHeight: "90vh", overflow: "auto", textAlign: "left" }}>
            <h2 id="preview-title">ตรวจสอบก่อนอัปโหลด</h2>
            {file && isPdf && previewUrl && <iframe src={previewUrl} title="ตัวอย่างไฟล์" style={{ width: "100%", height: 360, border: "1px solid #e3e9f3", borderRadius: 8 }} />}
            {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview */}
            {file && isImage && previewUrl && <img src={previewUrl} alt="ตัวอย่างไฟล์" style={{ maxWidth: "100%", maxHeight: 360, display: "block", margin: "0 auto", borderRadius: 8 }} />}
            {file && !isPdf && !isImage && <p>ไฟล์ {fileLabel(file.type)} แสดงตัวอย่างในเบราว์เซอร์ไม่ได้ — ตรวจชื่อไฟล์ให้ถูกต้อง: <b>{file.name}</b></p>}
            {!file && <p>ยังไม่ได้แนบไฟล์ (บันทึกเป็นร่างได้ แล้วค่อยแนบไฟล์ภายหลัง)</p>}
            <div className="info-row"><span className="info-label">ชื่อชีต</span><strong>{draft.title}</strong></div>
            <div className="info-row"><span className="info-label">วิชา / หมวดหมู่</span><strong>{draft.subject} / {draft.category}</strong></div>
            <div className="info-row"><span className="info-label">คำอธิบาย</span><strong>{draft.description || "—"}</strong></div>
            <div className="info-row"><span className="info-label">ไฟล์</span><strong>{file ? `${file.name} (${sizeLabel(file.size)})` : "—"}</strong></div>
            <div className="info-row"><span className="info-label">การเผยแพร่</span><strong>{draft.publish ? "เผยแพร่ทันที" : "บันทึกเป็นร่าง"}</strong></div>
            <div className="confirm-actions">
              <button className="secondary-button" type="button" disabled={busy} onClick={() => setDraft(null)}>แก้ไข</button>
              <button className="action-button" type="button" disabled={busy} onClick={confirmUpload}><Icon name="cloud-upload" size={15} /> {busy ? "กำลังอัปโหลด..." : "ยืนยันอัปโหลด"}</button>
            </div>
          </section>
        </div>
      )}
      <Footer />
    </main>
  );
}
