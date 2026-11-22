"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import Icon from "@/components/ui/Icon";

type Sheet = { id: string; title: string; description: string; category: string; tags: string[]; fileName: string | null; isPublished: boolean; visibility: string };

export default function EditSheetPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [visibility, setVisibility] = useState("private");
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/sheets/" + id).then(async (response) => {
      if (response.status === 401) { router.replace("/login"); return; }
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "โหลดชีตไม่สำเร็จ");
      setSheet(payload.sheet as Sheet);
      setTags(payload.sheet.tags);
      setVisibility(payload.sheet.visibility ?? (payload.sheet.isPublished ? "public" : "private"));
    }).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "โหลดชีตไม่สำเร็จ"));
  }, [id, router]);

  const addTag = (event: FormEvent) => {
    event.preventDefault();
    const value = newTag.trim();
    if (value && !tags.some((tag) => tag.toLowerCase() === value.toLowerCase())) setTags((current) => [...current, value]);
    setNewTag("");
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!sheet) return;
    setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    form.delete("tags");
    tags.forEach((tag) => form.append("tags", tag));
    form.set("visibility", visibility);
    if (file) form.set("file", file);
    try {
      const response = await fetch("/api/sheets/" + id, { method: "PATCH", body: form });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "บันทึกไม่สำเร็จ");
      router.push("/my-sheets");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "บันทึกไม่สำเร็จ"); }
    finally { setBusy(false); }
  };

  return (
    <main className="site-frame">
      <Navbar active="sheets" />
      <section className="page-surface">
        <div className="section-heading"><h1 className="section-title"><Link className="back-icon-button" href="/my-sheets" aria-label="กลับไปชีตของฉัน"><Icon name="arrow-left" size={20} /></Link><span>แก้ไขชีต<small>ปรับรายละเอียดและการเผยแพร่ชีตของคุณ</small></span></h1><div style={{ display: "flex", gap: 8 }}><a className="secondary-button" href={"/api/sheets/" + id + "/file"} target="_blank" rel="noreferrer"><Icon name="eye" size={15} /> ดูตัวอย่าง</a><button className="action-button" type="submit" form="edit-sheet-form" disabled={busy}><Icon name="save" size={15} /> บันทึกการเปลี่ยนแปลง</button></div></div>
        {error && <p className="auth-error" role="alert">{error}</p>}
        {!sheet && !error && <div className="empty-state">กำลังโหลดข้อมูลชีต...</div>}
        {sheet && <form id="edit-sheet-form" onSubmit={save} className="edit-layout">
          <aside className="edit-file"><div className="pdf-preview"><div className="pdf-icon"><span>{sheet.fileName?.toLowerCase().endsWith(".pdf") ? "PDF" : "FILE"}</span></div></div><button className="secondary-button" type="button" onClick={() => fileInput.current?.click()}><Icon name="cloud-upload" size={15} /> {file?.name ?? "เปลี่ยนไฟล์"}</button><input ref={fileInput} type="file" accept=".pdf,.doc,.docx,.ppt,.pptx" hidden onChange={(event) => setFile(event.target.files?.[0] ?? null)} /><small style={{ color: "#8b97a9", textAlign: "center" }}>รองรับไฟล์ PDF, DOCX, PPTX ขนาดไม่เกิน 10 MB</small></aside>
          <section className="edit-fields">
            <label htmlFor="sheet-title">ชื่อชีต *</label><input id="sheet-title" name="title" defaultValue={sheet.title} maxLength={100} required />
            <label htmlFor="sheet-description">คำอธิบาย</label><textarea id="sheet-description" name="description" defaultValue={sheet.description} maxLength={300} />
            <label htmlFor="sheet-subject">หมวดหมู่ *</label><select id="sheet-subject" name="category" defaultValue={sheet.category} required><option>Web Development</option><option>Database</option><option>Layout</option><option>UI/UX</option><option>อื่น ๆ</option></select>
            <label>แท็ก</label><div className="tag-list">{tags.map((tag) => <button className="tag" key={tag} type="button" onClick={() => setTags((current) => current.filter((item) => item !== tag))}>{tag} <Icon name="close" size={11} /></button>)}<div className="upload-add-tag-form"><input aria-label="เพิ่มแท็ก" value={newTag} onChange={(event) => setNewTag(event.target.value)} placeholder="แท็กใหม่" /><button type="button" aria-label="ยืนยันเพิ่มแท็ก" onClick={() => { if (newTag.trim() && !tags.some((tag) => tag.toLowerCase() === newTag.trim().toLowerCase())) setTags((current) => [...current, newTag.trim()]); setNewTag(""); }}><Icon name="plus" size={12} /></button></div></div>
            <label>การตั้งค่าการมองเห็น</label><div className="radio-list"><label><input type="radio" name="visibility-choice" checked={visibility === "public"} onChange={() => setVisibility("public")} /> สาธารณะ (ทุกคนดูได้)</label><label><input type="radio" name="visibility-choice" checked={visibility === "members"} onChange={() => setVisibility("members")} /> เฉพาะสมาชิก CM HUB</label><label><input type="radio" name="visibility-choice" checked={visibility === "private"} onChange={() => setVisibility("private")} /> ส่วนตัว (เฉพาะคุณ)</label></div>
            <div className="edit-actions"><Link className="secondary-button" href="/my-sheets"><Icon name="arrow-left" size={14} /> ยกเลิก</Link><button className="action-button" type="submit" disabled={busy}><Icon name="save" size={15} /> {busy ? "กำลังบันทึก..." : "บันทึกการเปลี่ยนแปลง"}</button></div>
          </section>
        </form>}
      </section>
      <Footer />
    </main>
  );
}
