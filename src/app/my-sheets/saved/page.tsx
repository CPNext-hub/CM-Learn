"use client";

// Saved sheets (favorites) — GET /api/v1/favorites, DELETE /api/v1/favorites/:sheetId (BE02).
// FUNCTIONAL PLACEHOLDER: the layout is intentionally plain. FE01 will design this page;
// the data and actions below (list, open, download, un-save) already work and can be kept as they are.
// Each item has the same fields as GET /api/v1/sheets (owner, subject, category, file, counts,
// previewUrl, downloadUrl…) plus `favoritedAt`.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { fileLabel, sizeLabel } from "@/lib/api-client";
import { getSavedSheets, setFavorite, type SavedSheet } from "@/services/interactionService";

export default function SavedSheetsPage() {
  const router = useRouter();
  const [sheets, setSheets] = useState<SavedSheet[] | null>(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getSavedSheets()
      .then((items) => {
        if (!active) return;
        if (items === null) router.replace("/login"); // not signed in
        else setSheets(items);
      })
      .catch((err: unknown) => active && setError(err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ"));
    return () => {
      active = false;
    };
  }, [router]);

  async function unsave(sheetId: string) {
    if (busyId) return;
    setBusyId(sheetId);
    setError("");
    try {
      await setFavorite(sheetId, false);
      setSheets((current) => current?.filter((s) => s.id !== sheetId) ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "เลิกบันทึกไม่สำเร็จ");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main style={{ maxWidth: 880, margin: "0 auto", padding: "32px 16px" }}>
      <p><Link href="/my-sheets">← ชีทของฉัน</Link></p>
      <h1 style={{ fontSize: 24, fontWeight: 700, margin: "12px 0 4px" }}>ชีทที่บันทึกไว้</h1>
      <p style={{ color: "#666", marginBottom: 20 }}>ชีทที่คุณกด ♡ บันทึกไว้ เรียงจากที่บันทึกล่าสุด</p>

      {error && <p role="alert" style={{ color: "#c0392b" }}>{error}</p>}

      {sheets === null && !error ? (
        <p>กำลังโหลด...</p>
      ) : sheets && sheets.length === 0 ? (
        <p>
          ยังไม่มีชีทที่บันทึกไว้ — <Link href="/discover">ไปหาชีท</Link>
        </p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 12 }}>
          {sheets?.map((sheet) => (
            <li key={sheet.id} style={{ border: "1px solid #ddd", borderRadius: 8, padding: 16 }}>
              <Link href={`/sheets/${sheet.id}`} style={{ fontWeight: 600 }}>{sheet.title}</Link>
              <div style={{ fontSize: 13, color: "#666", marginTop: 4 }}>
                {sheet.subject?.name ?? "ไม่ระบุวิชา"} · {sheet.category?.name ?? "ทั่วไป"} · โดย {sheet.owner.name}
                {sheet.file && ` · ${fileLabel(sheet.file.mimeType)} ${sizeLabel(sheet.file.sizeBytes)}`}
              </div>
              <div style={{ fontSize: 13, color: "#666" }}>
                เข้าชม {sheet.viewCount} · ถูกใจ {sheet.likeCount} · ความคิดเห็น {sheet.commentCount} · บันทึกเมื่อ{" "}
                {new Date(sheet.favoritedAt).toLocaleString("th-TH")}
              </div>
              {sheet.description && <p style={{ marginTop: 8 }}>{sheet.description}</p>}
              <div style={{ display: "flex", gap: 12, marginTop: 8, fontSize: 14 }}>
                <Link href={`/sheets/${sheet.id}`}>ดูรายละเอียด</Link>
                {sheet.downloadUrl && <a href={sheet.downloadUrl}>ดาวน์โหลด</a>}
                <button type="button" onClick={() => unsave(sheet.id)} disabled={busyId === sheet.id}>
                  {busyId === sheet.id ? "กำลังเลิกบันทึก..." : "เลิกบันทึก"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
