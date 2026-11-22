"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import Icon from "@/components/ui/Icon";
import { api, errorText, fileLabel, sizeLabel, STATUS_LABEL, type Sheet } from "@/lib/api-client";

const ALL = "ทั้งหมด";

// My Sheets → GET /api/v1/users/me/sheets, DELETE /api/v1/sheets/:id
export default function MySheetsPage() {
  const [query, setQuery] = useState("");
  const [subject, setSubject] = useState(ALL);
  const [status, setStatus] = useState(ALL);
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
    // The API returns at most 50 per page: keep asking until we have every page.
    (async () => {
      const all: Sheet[] = [];
      for (let page = 1; ; page++) {
        const result = await api<Sheet[]>(`/api/v1/users/me/sheets?pageSize=50&page=${page}`);
        if (!result.ok) {
          if (result.status === 401) router.replace("/login");
          else setMessage(errorText(result.error));
          break;
        }
        all.push(...result.data);
        if (!result.pagination || page >= result.pagination.totalPages) break;
      }
      setSheets(all);
      setLoading(false);
    })();
  }, [router]);

  const subjects = useMemo(
    () => [ALL, ...new Set(sheets.map((sheet) => sheet.subject?.name ?? "ไม่ระบุวิชา"))],
    [sheets],
  );
  const visibleSheets = useMemo(
    () =>
      sheets
        .filter(
          (sheet) =>
            sheet.title.toLowerCase().includes(query.toLowerCase()) &&
            (subject === ALL || (sheet.subject?.name ?? "ไม่ระบุวิชา") === subject) &&
            (status === ALL || sheet.status === status),
        )
        .sort((a, b) =>
          sort === "name"
            ? a.title.localeCompare(b.title, "th")
            : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        ),
    [sheets, query, subject, status, sort],
  );

  const deleteSheet = async () => {
    if (!pendingDelete) return;
    setBusy(true);
    const result = await api<{ id: string }>(`/api/v1/sheets/${pendingDelete.id}`, { method: "DELETE" });
    setBusy(false);
    if (result.ok) {
      setSheets((current) => current.filter((item) => item.id !== pendingDelete.id));
      setPendingDelete(null);
      setMessage("ลบชีตเรียบร้อยแล้ว");
    } else {
      setPendingDelete(null);
      setMessage(errorText(result.error));
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
          <select aria-label="วิชา" value={subject} onChange={(event) => setSubject(event.target.value)}>
            {subjects.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <select aria-label="สถานะ" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value={ALL}>ทุกสถานะ</option>
            <option value="published">เผยแพร่</option>
            <option value="draft">ร่าง</option>
            <option value="hidden">ซ่อน</option>
          </select>
          <select aria-label="เรียงลำดับ" value={sort} onChange={(event) => setSort(event.target.value)}>
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
            {visibleSheets.map((sheet) => {
              const openUrl = sheet.previewUrl ?? sheet.downloadUrl;
              const cover = (
                <div className="pdf-icon">
                  <span>{sheet.file ? fileLabel(sheet.file.mimeType) : "ร่าง"}</span>
                </div>
              );
              return (
                <article className="sheet-card" key={sheet.id}>
                  {openUrl ? (
                    <a className="pdf-preview" href={openUrl} target="_blank" rel="noreferrer" aria-label={`เปิดไฟล์ ${sheet.title}`}>
                      {cover}
                    </a>
                  ) : (
                    <div className="pdf-preview" aria-label="ยังไม่มีไฟล์">{cover}</div>
                  )}
                  <h3>{sheet.title}</h3>
                  <div className="sheet-meta">
                    {sheet.subject?.name ?? "ไม่ระบุวิชา"} · {sizeLabel(sheet.file?.sizeBytes)} · ดู {sheet.viewCount}
                  </div>
                  <span className="published">{STATUS_LABEL[sheet.status]}</span>
                  <div className="card-actions">
                    <Link href={`/my-sheets/${sheet.id}/edit`}>
                      <Icon name="edit" size={14} /> แก้ไข
                    </Link>
                    <button className="delete" type="button" onClick={() => setPendingDelete(sheet)}>
                      <Icon name="trash" size={14} /> ลบ
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="empty-state">{sheets.length ? "ไม่พบชีตที่ตรงกับการค้นหา" : "ยังไม่มีชีตที่อัปโหลดไว้"}</div>
        )}
      </section>
      {pendingDelete && (
        <div className="confirm-backdrop" onMouseDown={() => !busy && setPendingDelete(null)}>
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
              คุณต้องการลบ “{pendingDelete.title}” ใช่ไหม ชีตจะหายจากทุกหน้า
              (ถ้าต้องการซ่อนชั่วคราว ให้ใช้ “แก้ไข” แล้วเลือก “ซ่อน”)
            </p>
            <div className="confirm-actions">
              <button className="secondary-button" type="button" disabled={busy} onClick={() => setPendingDelete(null)}>
                ยกเลิก
              </button>
              <button className="confirm-delete" type="button" disabled={busy} onClick={deleteSheet}>
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
