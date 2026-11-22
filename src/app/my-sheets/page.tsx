"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import Icon from "@/components/ui/Icon";

type Sheet = {
  id: string;
  title: string;
  category: string;
  fileSize: number | null;
  fileName: string | null;
  isPublished: boolean;
  visibility: string;
  createdAt: string;
};
const sizeLabel = (size: number | null) =>
  size == null
    ? "—"
    : size >= 1024 * 1024
      ? `${(size / (1024 * 1024)).toFixed(1)} MB`
      : `${Math.max(1, Math.round(size / 1024))} KB`;

export default function MySheetsPage() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("ทั้งหมด");
  const [sort, setSort] = useState("newest");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [pendingDelete, setPendingDelete] = useState<Sheet | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();

  useEffect(() => {
    setQuery(new URLSearchParams(window.location.search).get("search") ?? "");
    fetch("/api/sheets")
      .then(async (response) => {
        if (response.status === 401) {
          router.replace("/login");
          return;
        }
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "โหลดชีตไม่สำเร็จ");
        setSheets(payload.sheets as Sheet[]);
      })
      .catch((error: unknown) =>
        setMessage(error instanceof Error ? error.message : "โหลดชีตไม่สำเร็จ"),
      )
      .finally(() => setLoading(false));
  }, [router]);

  const categories = useMemo(
    () => ["ทั้งหมด", ...new Set(sheets.map((sheet) => sheet.category))],
    [sheets],
  );
  const visibleSheets = useMemo(
    () =>
      sheets
        .filter(
          (sheet) =>
            sheet.title.toLowerCase().includes(query.toLowerCase()) &&
            (category === "ทั้งหมด" || sheet.category === category),
        )
        .sort((a, b) =>
          sort === "name"
            ? a.title.localeCompare(b.title, "th")
            : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        ),
    [sheets, query, category, sort],
  );

  const deleteSheet = async () => {
    if (!pendingDelete) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/sheets/${pendingDelete.id}`, {
        method: "DELETE",
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "ลบชีตไม่สำเร็จ");
      setSheets((current) =>
        current.filter((item) => item.id !== pendingDelete.id),
      );
      setPendingDelete(null);
      setMessage("ลบชีตเรียบร้อยแล้ว");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "ลบชีตไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="site-frame">
      <Navbar active="sheets" />
      <section className="page-surface">
        <div className="section-heading">
          <h1 className="section-title">
            <span className="folder-icon">
              <Icon name="folder" size={36} />
            </span>
            <span>
              ชีตของฉัน<small>จัดการชีตที่คุณสร้างและอัปโหลด</small>
            </span>
          </h1>
          <Link className="action-button" href="/upload">
            <Icon name="plus" size={16} /> บันทึกชีตใหม่
          </Link>
        </div>
        {message && (
          <p className="upload-success" role="status">
            {message}
          </p>
        )}
        <div className="toolbar">
          <label className="sheet-searchbox">
            <Icon name="search" size={16} />
            <input
              aria-label="ค้นหาชีต"
              placeholder="ค้นหาชีตของฉัน..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <select
            aria-label="หมวดหมู่"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            {categories.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <select
            aria-label="เรียงลำดับ"
            value={sort}
            onChange={(event) => setSort(event.target.value)}
          >
            <option value="newest">ใหม่ล่าสุด</option>
            <option value="name">ชื่อ A-Z</option>
          </select>
          <div className="view-toggle">
            <button
              className={view === "grid" ? "selected" : ""}
              aria-label="มุมมองตาราง"
              aria-pressed={view === "grid"}
              onClick={() => setView("grid")}
            >
              <Icon name="grid" size={16} />
            </button>
            <button
              className={view === "list" ? "selected" : ""}
              aria-label="มุมมองรายการ"
              aria-pressed={view === "list"}
              onClick={() => setView("list")}
            >
              <Icon name="list" size={16} />
            </button>
          </div>
        </div>
        {loading ? (
          <div className="empty-state">กำลังโหลดชีต...</div>
        ) : visibleSheets.length ? (
          <div className={`sheet-grid ${view === "list" ? "sheet-list" : ""}`}>
            {visibleSheets.map((sheet) => (
              <article className="sheet-card" key={sheet.id}>
                <a
                  className="pdf-preview"
                  href={`/api/sheets/${sheet.id}/file`}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`เปิดไฟล์ ${sheet.title}`}
                >
                  <div className="pdf-icon">
                    <span>
                      {sheet.fileName?.toLowerCase().endsWith(".pdf")
                        ? "PDF"
                        : "FILE"}
                    </span>
                  </div>
                </a>
                <h3>{sheet.title}</h3>
                <div className="sheet-meta">
                  {sheet.category} · {sizeLabel(sheet.fileSize)}
                </div>
                <span className="published">
                  {sheet.visibility === "public"
                    ? "สาธารณะ"
                    : sheet.visibility === "members"
                      ? "เฉพาะสมาชิก"
                      : "ส่วนตัว"}
                </span>
                <div className="card-actions">
                  <Link href={`/my-sheets/${sheet.id}/edit`}>
                    <Icon name="edit" size={14} /> แก้ไข
                  </Link>
                  <button
                    className="delete"
                    type="button"
                    onClick={() => setPendingDelete(sheet)}
                  >
                    <Icon name="trash" size={14} /> ลบ
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            {sheets.length
              ? "ไม่พบชีตที่ตรงกับการค้นหา"
              : "ยังไม่มีชีตที่อัปโหลดไว้"}
          </div>
        )}
      </section>
      {pendingDelete && (
        <div
          className="confirm-backdrop"
          onMouseDown={() => !busy && setPendingDelete(null)}
        >
          <section
            className="confirm-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="confirm-icon">
              <Icon name="trash" size={22} />
            </div>
            <h2 id="delete-title">ยืนยันการลบชีต?</h2>
            <p>
              คุณต้องการลบ “{pendingDelete.title}” ใช่ไหม
              การลบนี้ไม่สามารถย้อนกลับได้
            </p>
            <div className="confirm-actions">
              <button
                className="secondary-button"
                type="button"
                disabled={busy}
                onClick={() => setPendingDelete(null)}
              >
                ยกเลิก
              </button>
              <button
                className="confirm-delete"
                type="button"
                disabled={busy}
                onClick={deleteSheet}
              >
                <Icon name="trash" size={15} /> {busy ? "กำลังลบ..." : "ลบชีต"}
              </button>
            </div>
          </section>
        </div>
      )}
      <Footer />
    </main>
  );
}
