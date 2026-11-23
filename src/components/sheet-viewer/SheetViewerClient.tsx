"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";

import { getSheetViewer } from "@/services/sheetViewerService";
import { initials } from "@/lib/api-client";
import { useComments, useViewer } from "@/components/interactions/useInteractions";
import type { SheetComment } from "@/types/interaction";
import type { SheetViewer } from "@/types/sheetViewer";

import styles from "./SheetViewer.module.css";

type Props = {
    sheetId: string;
};

// Document viewer (FE01 design). Shows the real file: PDF in the browser's PDF viewer
// (its own page/zoom controls), images with a zoom control, Office files as a download.
// Comments come from BE02's Interaction API (see ViewerComments below).
// Hidden because the backend has no data for them: per-page thumbnails, review rating,
// download & follower counts, follow button, emoji reactions, comment likes.
export default function SheetViewerClient({ sheetId }: Props) {
    const [sheet, setSheet] = useState<SheetViewer | null>(null);
    const [error, setError] = useState("");
    const [attempt, setAttempt] = useState(0);
    const [zoom, setZoom] = useState(100);
    const [commentCount, setCommentCount] = useState<number | null>(null); // live count from the comments panel

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
                            <div><strong>{formatCount(commentCount ?? sheet.commentCount)}</strong><span>ความคิดเห็น</span></div>
                        </div>
                    </section>

                    <ViewerComments sheetId={sheet.id} fallbackCount={sheet.commentCount} onCountChange={setCommentCount} />
                </aside>
            </div>
        </main>
    );
}

// Compact comments panel (FE01 design) wired to BE02: post, read with replies, delete your own.
// Replying is done on the sheet detail page, which has room for the reply form.
function ViewerComments({ sheetId, fallbackCount, onCountChange }: { sheetId: string; fallbackCount: number; onCountChange: (count: number) => void }) {
    const { userId, ready } = useViewer();
    const { comments, loadError, count, add, remove } = useComments(sheetId);

    useEffect(() => {
        if (count !== null) onCountChange(count);
    }, [count, onCountChange]);
    const [text, setText] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [actionError, setActionError] = useState("");

    async function submit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        if (!text.trim() || submitting) return;
        setSubmitting(true);
        const error = await add(text.trim());
        setActionError(error);
        if (!error) setText("");
        setSubmitting(false);
    }

    async function removeComment(commentId: string) {
        if (!window.confirm("ลบความคิดเห็นนี้ใช่ไหม? (ลบแล้วกู้คืนไม่ได้)")) return;
        setActionError(await remove(commentId));
    }

    const item = (c: SheetComment, isReply: boolean) => (
        <article key={c.id} className={styles.comment} style={isReply ? { marginLeft: 14, paddingLeft: 10, borderLeft: "2px solid var(--border)", borderBottom: 0 } : undefined}>
            <div className={styles.commentAuthor}>
                <strong>{c.authorName}</strong>
                <time>{new Date(c.createdAt).toLocaleDateString("th-TH")}</time>
            </div>
            <p style={c.deleted ? { fontStyle: "italic", color: "var(--muted)" } : undefined}>{c.deleted ? "ความคิดเห็นนี้ถูกลบแล้ว" : c.body}</p>
            {!c.deleted && userId === c.authorId && (
                <button className={styles.likeButton} onClick={() => void removeComment(c.id)}>ลบ</button>
            )}
            {!isReply && c.replies.map((r) => item(r, true))}
        </article>
    );

    return (
        <section className={styles.card}>
            <div className={styles.cardHeading}>
                <strong>▤ ความคิดเห็นเพื่อน ๆ</strong>
                <span>{count ?? fallbackCount} ความคิดเห็น</span>
            </div>

            {ready && !userId ? (
                <p className={styles.emptyComments}><Link href="/login">เข้าสู่ระบบ</Link> เพื่อแสดงความคิดเห็น</p>
            ) : (
                <form className={styles.commentForm} onSubmit={submit}>
                    <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="พิมพ์ข้อความให้กำลังใจ..." maxLength={5000} />
                    <button type="submit" disabled={!text.trim() || submitting} aria-label="ส่งความคิดเห็น">{submitting ? "..." : "➤"}</button>
                </form>
            )}
            {actionError && <p className={styles.emptyComments} style={{ color: "#c0392b" }}>{actionError}</p>}

            <div className={styles.commentList}>
                {loadError ? (
                    <p className={styles.emptyComments}>{loadError}</p>
                ) : comments === null ? (
                    <p className={styles.emptyComments}>กำลังโหลดความคิดเห็น...</p>
                ) : comments.length === 0 ? (
                    <p className={styles.emptyComments}>ยังไม่มีความคิดเห็น</p>
                ) : (
                    comments.map((c) => item(c, false))
                )}
            </div>
            <Link href={`/sheets/${sheetId}`} className={styles.likeButton} style={{ display: "block", marginTop: 10, textAlign: "center" }}>
                ตอบกลับความคิดเห็นได้ที่หน้ารายละเอียดชีท →
            </Link>
        </section>
    );
}
