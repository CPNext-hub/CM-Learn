"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { getSheetViewer } from "@/services/sheetViewerService";
import { initials } from "@/lib/api-client";
import type { SheetViewer } from "@/types/sheetViewer";

import styles from "./SheetViewer.module.css";

type Props = {
    sheetId: string;
};

// Document viewer (FE01 design). Shows the real file: PDF in the browser's PDF viewer
// (its own page/zoom controls), images with a zoom control, Office files as a download.
// Hidden until the backend has them: per-page thumbnails, review rating, download & follower counts,
// follow button, emoji reactions, comments (Comment API = BE02, in progress).
export default function SheetViewerClient({ sheetId }: Props) {
    const [sheet, setSheet] = useState<SheetViewer | null>(null);
    const [error, setError] = useState("");
    const [attempt, setAttempt] = useState(0);
    const [zoom, setZoom] = useState(100);

    useEffect(() => {
        let active = true;
        getSheetViewer(sheetId)
            .then((data) => {
                if (!active) return;
                setSheet(data);
                setError("");
            })
            .catch((err: unknown) => active && setError(err instanceof Error ? err.message : "ไม่สามารถโหลดข้อมูลชีทได้"));
        return () => {
            active = false;
        };
    }, [sheetId, attempt]);

    const formatCount = (value: number) =>
        new Intl.NumberFormat("th-TH", { notation: value >= 10000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(value);

    if (error) {
        return (
            <main className={styles.page}>
                <div className={styles.message}>
                    <h3>ไม่สามารถเปิดชีทได้</h3>
                    <p>{error}</p>
                    <button onClick={() => setAttempt((n) => n + 1)}>ลองอีกครั้ง</button>
                </div>
            </main>
        );
    }

    if (!sheet) {
        return (
            <main className={styles.page}>
                <div className={styles.message}>กำลังโหลดข้อมูลชีท...</div>
            </main>
        );
    }

    const isPdf = sheet.fileType === "PDF";

    return (
        <main className={styles.page}>

            {/* Toolbar */}
            <header className={styles.toolbar}>
                <Link href={`/sheets/${sheet.id}`} className={styles.backLink}>← รายละเอียดชีท</Link>
                <div className={styles.sheetTitle}>{sheet.title}</div>
                <div className={styles.controls}>
                    {sheet.isImage && (
                        <>
                            <button onClick={() => setZoom(Math.max(50, zoom - 10))}>−</button>
                            <span>{zoom}%</span>
                            <button onClick={() => setZoom(Math.min(150, zoom + 10))}>+</button>
                        </>
                    )}
                    {sheet.downloadUrl && (
                        <a href={sheet.downloadUrl} className={styles.downloadButton}>↓ ดาวน์โหลด {sheet.fileType}</a>
                    )}
                </div>
            </header>

            <div className={styles.layout}>

                {/* Left: file info (instead of per-page thumbnails) */}
                <aside className={styles.thumbnailPanel}>
                    <div className={styles.panelHeading}>
                        <strong>▤ ข้อมูลชีท</strong>
                        <span>{sheet.fileType || "—"}</span>
                    </div>
                    <div className={styles.thumbnailList}>
                        <div className={styles.thumbnail}><span>วิชา: {sheet.subjectName}</span></div>
                        <div className={styles.thumbnail}><span>หมวดหมู่: {sheet.categoryName}</span></div>
                    </div>
                </aside>

                {/* Center: Document */}
                <section className={styles.documentPanel}>
                    <div className={styles.documentCanvas}>
                        {sheet.previewUrl && isPdf ? (
                            <iframe src={sheet.previewUrl} title={sheet.title} style={{ width: "100%", height: "78vh", border: 0, background: "#fff", borderRadius: 8 }} />
                        ) : (
                            <div className={styles.paper} style={{ width: `${zoom}%` }}>
                                {sheet.previewUrl && sheet.isImage ? (
                                    // eslint-disable-next-line @next/next/no-img-element -- image served by our API
                                    <img src={sheet.previewUrl} alt={sheet.title} />
                                ) : (
                                    <div className={styles.noPreview}>
                                        ไฟล์ {sheet.fileType || "นี้"} แสดงในเบราว์เซอร์ไม่ได้ — กด “ดาวน์โหลด” เพื่อเปิดอ่าน
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                    <div className={styles.documentFooter}>
                        <span>{isPdf ? "ใช้ปุ่มของตัวแสดง PDF เพื่อเปลี่ยนหน้า / ซูม" : sheet.fileType}</span>
                        <span>{sheet.subjectName}</span>
                    </div>
                </section>

                {/* Right: Creator / stats / comments notice */}
                <aside className={styles.rightPanel}>
                    <section className={styles.card}>
                        <div className={styles.creator}>
                            {sheet.creator.avatarUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element -- avatar from our API
                                <img src={sheet.creator.avatarUrl} alt={sheet.creator.displayName} />
                            ) : (
                                <div className={styles.avatarPlaceholder}>{initials(sheet.creator.displayName)}</div>
                            )}
                            <div>
                                <strong>{sheet.creator.displayName}</strong>
                                <span>ผู้สร้างชีท</span>
                            </div>
                        </div>
                        <div className={styles.stats}>
                            <div><strong>{formatCount(sheet.viewCount)}</strong><span>เข้าชม</span></div>
                            <div><strong>{formatCount(sheet.likeCount)}</strong><span>ถูกใจ</span></div>
                            <div><strong>{formatCount(sheet.commentCount)}</strong><span>ความคิดเห็น</span></div>
                        </div>
                    </section>

                    <section className={styles.card}>
                        <div className={styles.cardHeading}>
                            <strong>▤ ความคิดเห็นเพื่อน ๆ</strong>
                            <span>{sheet.commentCount} ความคิดเห็น</span>
                        </div>
                        <p className={styles.emptyComments}>ระบบความคิดเห็นกำลังพัฒนา (เปิดใช้เมื่อ API ของ BE02 พร้อม)</p>
                    </section>
                </aside>
            </div>
        </main>
    );
}
