"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ErrorBox, FilePreview, LookupSelect, useLookups } from "../../_components";
import { ACCEPT, api, formatBytes, formatDate, STATUS_LABEL, type ApiErrorBody, type Sheet } from "../../_lib";

// Sheet Detail → GET/PATCH/DELETE /api/v1/sheets/:id and GET /api/v1/sheets/:id/download
export default function TestSheetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { subjects, categories } = useLookups();
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [error, setError] = useState<{ body: ApiErrorBody; status: number } | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [previewVersion, setPreviewVersion] = useState(0); // forces the iframe to reload after a new file

  const load = useCallback(async () => {
    const result = await api<Sheet>(`/api/v1/sheets/${id}`);
    if (result.ok) {
      setSheet(result.data);
      setError(null);
    } else {
      setSheet(null);
      setError({ body: result.error, status: result.status });
    }
  }, [id]);

  // React dev mode runs effects twice; the ref stops that from counting two views.
  const loadedOnce = useRef(false);
  useEffect(() => {
    if (loadedOnce.current) return;
    loadedOnce.current = true;
    load();
  }, [load]);

  async function patch(body: BodyInit, isJson: boolean, done: string) {
    setBusy(true);
    setMessage("");
    const result = await api<Sheet>(`/api/v1/sheets/${id}`, {
      method: "PATCH",
      body,
      headers: isJson ? { "Content-Type": "application/json" } : undefined,
    });
    setBusy(false);
    if (result.ok) {
      setSheet((old) => ({ ...result.data, viewer: old?.viewer }));
      setError(null);
      setMessage(`✅ ${done} (HTTP ${result.status})`);
      setPreviewVersion((v) => v + 1);
    } else {
      setError({ body: result.error, status: result.status });
    }
  }

  function handleEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) form.delete("file");
    patch(form, false, "บันทึกการแก้ไขแล้ว");
  }

  async function handleDelete() {
    if (!confirm("ลบชีทนี้ใช่ไหม?")) return;
    setBusy(true);
    const result = await api<{ id: string }>(`/api/v1/sheets/${id}`, { method: "DELETE" });
    setBusy(false);
    if (result.ok) router.push("/test/my-sheets");
    else setError({ body: result.error, status: result.status });
  }

  if (!sheet) {
    return (
      <main>
        <h1>รายละเอียดชีท</h1>
        {error ? <ErrorBox error={error.body} status={error.status} /> : <p>กำลังโหลด...</p>}
      </main>
    );
  }

  const isOwner = sheet.viewer?.isOwner ?? false;
  const previewUrl = sheet.previewUrl ? `${sheet.previewUrl}&v=${previewVersion}` : null;

  return (
    <main>
      <h1>{sheet.title}</h1>
      <table border={1} cellPadding={4} style={{ borderCollapse: "collapse" }}>
        <tbody>
          <tr><th align="left">สถานะ</th><td>{STATUS_LABEL[sheet.status]}</td></tr>
          <tr><th align="left">คำอธิบาย</th><td style={{ whiteSpace: "pre-wrap" }}>{sheet.description ?? "-"}</td></tr>
          <tr><th align="left">วิชา / หมวดหมู่</th><td>{sheet.subject?.name ?? "-"} / {sheet.category?.name ?? "-"}</td></tr>
          <tr><th align="left">ผู้สร้าง</th><td>{sheet.owner.name}{isOwner && " (คุณ)"}</td></tr>
          <tr><th align="left">ยอดดู / 👍 / 👎 / 💬</th><td>{sheet.viewCount} / {sheet.likeCount} / {sheet.dislikeCount} / {sheet.commentCount}</td></tr>
          <tr><th align="left">Reaction ของคุณ</th><td>{sheet.viewer?.reaction ?? "-"} (Like/Comment เป็นงาน BE02)</td></tr>
          <tr><th align="left">ไฟล์</th><td>{sheet.file ? `v${sheet.file.versionNo} · ${sheet.file.mimeType} · ${formatBytes(sheet.file.sizeBytes)}` : "ยังไม่มีไฟล์"}</td></tr>
          <tr><th align="left">สร้าง / แก้ไขล่าสุด</th><td>{formatDate(sheet.createdAt)} / {formatDate(sheet.updatedAt)}</td></tr>
        </tbody>
      </table>

      {sheet.file && (
        <>
          <h2>Preview</h2>
          <FilePreview url={previewUrl} mimeType={sheet.file.mimeType} />
          <p>
            <a href={sheet.downloadUrl!}>⬇ ดาวน์โหลดไฟล์</a>
          </p>
        </>
      )}

      {message && <p>{message}</p>}
      <ErrorBox error={error?.body ?? null} status={error?.status} />

      {isOwner && (
        <section>
          <hr />
          <h2>จัดการชีท (เฉพาะเจ้าของ)</h2>
          <p>
            {sheet.status !== "hidden" ? (
              <button type="button" disabled={busy} onClick={() => patch(JSON.stringify({ status: "hidden" }), true, "ซ่อนชีทแล้ว")}>
                ซ่อนชีท
              </button>
            ) : (
              <button type="button" disabled={busy} onClick={() => patch(JSON.stringify({ status: "published" }), true, "เผยแพร่อีกครั้งแล้ว")}>
                เลิกซ่อน (เผยแพร่)
              </button>
            )}{" "}
            <button type="button" disabled={busy} onClick={handleDelete}>
              🗑 ลบชีท
            </button>
          </p>

          <h3>แก้ไขรายละเอียด / เปลี่ยนไฟล์</h3>
          <form onSubmit={handleEdit} key={sheet.updatedAt /* reset fields after each save */}>
            <p>
              <label>ชื่อชีท <input name="title" defaultValue={sheet.title} size={50} /></label>
            </p>
            <p>
              <label>
                คำอธิบาย
                <br />
                <textarea name="description" defaultValue={sheet.description ?? ""} rows={3} cols={60} />
              </label>
            </p>
            <p>
              <LookupSelect name="subjectId" label="วิชา" options={subjects} defaultValue={sheet.subject?.id} />{" "}
              <LookupSelect name="categoryId" label="หมวดหมู่" options={categories} defaultValue={sheet.category?.id} />
            </p>
            <p>
              <label>
                สถานะ{" "}
                <select name="status" defaultValue={sheet.status}>
                  <option value="draft">ร่าง</option>
                  <option value="published">เผยแพร่</option>
                  <option value="hidden">ซ่อน</option>
                </select>
              </label>
            </p>
            <p>
              <label>ไฟล์ใหม่ (ไม่บังคับ — จะเป็นเวอร์ชันใหม่) <input type="file" name="file" accept={ACCEPT} /></label>
            </p>
            <button type="submit" disabled={busy}>{busy ? "กำลังบันทึก..." : "บันทึก"}</button>
          </form>
        </section>
      )}
    </main>
  );
}
