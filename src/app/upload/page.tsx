"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import Icon from "@/components/ui/Icon";

export default function UploadPage() {
  const [fileName, setFileName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const titleRef = useRef<HTMLInputElement>(null);
  const categoryRef = useRef<HTMLSelectElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const [tags, setTags] = useState([
    { name: "Layout", checked: true },
    { name: "Navbar", checked: true },
    { name: "UI/UX", checked: false },
  ]);
  const [addingTag, setAddingTag] = useState(false);
  const [newTag, setNewTag] = useState("");

  const addTag = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = newTag.trim();
    if (!name || tags.some((tag) => tag.name.toLowerCase() === name.toLowerCase())) return;
    setTags((current) => [...current, { name, checked: true }]);
    setNewTag("");
    setAddingTag(false);
  };

  const submitUpload = async () => {
    setError("");
    const title = titleRef.current?.value.trim() ?? "";
    const category = categoryRef.current?.value ?? "";
    if (!title || !category || !file) return setError("กรุณากรอกชื่อชีต เลือกวิชา และเลือกไฟล์");
    if (file.size > 10 * 1024 * 1024) return setError("ไฟล์ต้องมีขนาดไม่เกิน 10 MB");
    setBusy(true);
    const form = new FormData();
    form.set("title", title);
    form.set("category", category);
    form.set("description", descriptionRef.current?.value ?? "");
    tags.filter((tag) => tag.checked).forEach((tag) => form.append("tags", tag.name));
    form.set("file", file);
    try {
      const response = await fetch("/api/sheets", { method: "POST", body: form });
      const payload = await response.json();
      if (response.status === 401) { router.push("/login"); return; }
      if (!response.ok) throw new Error(payload.error ?? "อัปโหลดไม่สำเร็จ");
      router.push("/my-sheets");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "อัปโหลดไม่สำเร็จ");
    } finally { setBusy(false); }
  };

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
            <strong>{fileName || "ลากไฟล์มาวางที่นี่"}</strong>
            <span>รองรับไฟล์ PDF, DOCX, PPTX<br />ขนาดไม่เกิน 10 MB</span>
            <span className="upload-pick"><Icon name="file" size={15} /> เลือกไฟล์</span>
            <input id="upload-file" type="file" accept=".pdf,.doc,.docx,.ppt,.pptx" onChange={(event) => { const selected = event.target.files?.[0] ?? null; setFile(selected); setFileName(selected?.name ?? ""); }} />
          </label>
          <div className="upload-form">
            <label htmlFor="upload-title">ชื่อชีต <b>*</b></label>
            <input id="upload-title" ref={titleRef} placeholder="เช่น สรุปเรื่อง JavaScript" maxLength={100} />
            <label htmlFor="upload-subject">วิชา <b>*</b></label>
            <select id="upload-subject" ref={categoryRef} defaultValue=""><option value="" disabled>เลือกวิชา</option><option>Web Development</option><option>Database</option><option>Layout</option><option>UI/UX</option><option>อื่น ๆ</option></select>
            <label htmlFor="upload-description">คำอธิบาย</label>
            <textarea id="upload-description" ref={descriptionRef} placeholder="อธิบายเนื้อหาในชีต..." maxLength={300} />
            <div className="upload-tag-label">หมวดหมู่ / แท็ก</div>
            <div className="upload-tags">
              {tags.map((tag) => <label key={tag.name}><input type="checkbox" name="tags" value={tag.name} checked={tag.checked} onChange={(event) => setTags((current) => current.map((item) => item.name === tag.name ? { ...item, checked: event.target.checked } : item))} />{tag.name}</label>)}
              {addingTag ? <form className="upload-add-tag-form" onSubmit={addTag}>
                <input aria-label="ชื่อแท็กใหม่" autoFocus value={newTag} onChange={(event) => setNewTag(event.target.value)} placeholder="ชื่อแท็ก" />
                <button type="submit" aria-label="เพิ่มแท็ก"><Icon name="check" size={14} /></button>
                <button type="button" aria-label="ยกเลิก" onClick={() => { setAddingTag(false); setNewTag(""); }}><Icon name="close" size={14} /></button>
              </form> : <button className="upload-tag-add" type="button" onClick={() => setAddingTag(true)}><Icon name="plus" size={12} /> แท็กใหม่</button>}
            </div>
            <div className="upload-submit"><button type="button" disabled={busy} onClick={submitUpload}><Icon name="cloud-upload" size={16} /> {busy ? "กำลังอัปโหลด..." : "อัปโหลด"}</button></div>
          </div>
        </div>
      </section>
      <Footer />
    </main>
  );
}
