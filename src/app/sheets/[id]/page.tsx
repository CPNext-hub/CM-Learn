"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import type { Sheet, RelatedSheet } from "@/types/sheet";
import type { Reaction } from "@/types/interaction";
import { getSheet, getRelatedSheets } from "@/services/sheetService";
import { toggleReaction } from "@/services/interactionService";
import { initials, sizeLabel } from "@/lib/api-client";
import SheetComments from "@/components/interactions/SheetComments";
import { useFavorites, useViewer } from "@/components/interactions/useInteractions";

// Sheet Detail (FE01 design) — data from GET /api/v1/sheets/:id (BE01); related sheets from the same subject.
// Like/Dislike, save (favorites) and comments + replies come from BE02's Interaction API.
// Hidden because the backend has no data for them: page thumbnails / page count, word count, subject code,
// tags, "verified" badge, outline & reading tips, follow, the "useful / easy / exam-ready" reactions,
// download counter, comment likes.
export default function SheetDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();
  const viewer = useViewer();
  const favorites = useFavorites();

  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [related, setRelated] = useState<RelatedSheet[]>([]);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [reactionBusy, setReactionBusy] = useState(false);
  const [reactionError, setReactionError] = useState("");
  const [commentCount, setCommentCount] = useState<number | null>(null);

  async function handleReaction(clicked: Reaction) {
    if (!sheet || reactionBusy) return;
    if (viewer.ready && !viewer.userId) {
      router.push("/login");
      return;
    }
    setReactionBusy(true);
    setReactionError("");
    try {
      const next = await toggleReaction(sheet.id, clicked, { likes: sheet.stats.likes, dislikes: sheet.stats.dislikes, mine: sheet.myReaction });
      setSheet((prev) => prev && { ...prev, myReaction: next.mine, stats: { ...prev.stats, likes: next.likes, dislikes: next.dislikes } });
    } catch (err) {
      setReactionError(err instanceof Error ? err.message : "กดถูกใจไม่สำเร็จ กรุณาลองอีกครั้ง");
    } finally {
      setReactionBusy(false);
    }
  }

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    getSheet(id)
      .then((data) => {
        if (cancelled) return;
        setSheet(data);
        setError("");
        // Related sheets are a bonus: if they fail, the page still works.
        getRelatedSheets(data).then((items) => !cancelled && setRelated(items)).catch(() => {});
      })
      .catch((err: unknown) => !cancelled && setError(err instanceof Error ? err.message : "ไม่สามารถโหลดข้อมูลได้"));
    return () => {
      cancelled = true;
    };
  }, [id, attempt]);

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3">
        <p className="text-sm text-red-500">{error}</p>
        <div className="flex gap-2">
          <button type="button" onClick={() => setAttempt((n) => n + 1)} className="rounded-lg bg-[#883d5e] px-4 py-2 text-sm text-white">
            ลองอีกครั้ง
          </button>
          <Link href="/discover" className="rounded-lg border border-zinc-200 px-4 py-2 text-sm text-zinc-700">
            ไปหน้าค้นหาชีท
          </Link>
        </div>
      </div>
    );
  }

  if (!sheet) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-zinc-500">กำลังโหลดข้อมูลชีท...</p>
      </div>
    );
  }

  const isPdf = sheet.fileType === "PDF";

  return (
    <div className="min-h-screen">
      {/* TOPBAR */}
      <header className="sticky top-0 z-30 border-b border-zinc-200/70 bg-white/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#883d5e] text-xs font-bold text-white">SD</span>
              <div>
                <span className="block text-sm font-bold text-zinc-900">SheetDeedee</span>
                <span className="block text-[11px] text-zinc-500">คลังชีทสรุป</span>
              </div>
            </Link>
            <nav className="hidden items-center gap-1 text-sm text-zinc-600 lg:flex">
              <Link href="/" className="rounded-lg px-3 py-2 hover:bg-zinc-100">หน้าหลัก</Link>
              <Link href="/discover" className="rounded-lg bg-[#883d5e]/10 px-3 py-2 font-medium text-[#883d5e]">สำรวจชีท</Link>
              <Link href="/my-sheets" className="rounded-lg px-3 py-2 hover:bg-zinc-100">คลังชีทของฉัน</Link>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/upload" className="rounded-xl bg-[#883d5e] px-4 py-2 text-xs font-semibold text-white hover:bg-[#71314d]">+ โพสต์ชีท</Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-20 pt-7 sm:px-6">
        {/* BREADCRUMB */}
        <div className="mb-6 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
          <Link href="/" className="hover:text-zinc-900">หน้าหลัก</Link>
          <span>/</span>
          <Link href="/discover" className="hover:text-zinc-900">{sheet.category}</Link>
          <span>/</span>
          <span className="font-medium text-zinc-900">{sheet.subjectName}</span>
        </div>

        {/* MAIN SECTION */}
        <section className="grid grid-cols-1 gap-7 lg:grid-cols-12 lg:gap-9">
          {/* LEFT: PREVIEW */}
          <div className="lg:col-span-5">
            <div className="sheet-surface rounded-2xl p-5 sm:p-6">
              <div className="mb-4 flex items-center justify-between text-xs">
                <span className="font-medium text-zinc-600">ตัวอย่างเอกสาร</span>
                {sheet.fileType && <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700">{sheet.fileType}</span>}
              </div>

              <div className="sheet-paper-preview overflow-hidden rounded-xl bg-white">
                {sheet.previewUrl && isPdf ? (
                  <iframe src={`${sheet.previewUrl}#toolbar=0`} title="Sheet PDF Preview" className="h-[420px] w-full" />
                ) : sheet.previewUrl && sheet.isImage ? (
                  // eslint-disable-next-line @next/next/no-img-element -- image served by our API
                  <img src={sheet.previewUrl} alt={sheet.title} className="max-h-[420px] w-full object-contain" />
                ) : (
                  <div className="flex min-h-[300px] items-center justify-center px-6 text-center text-sm text-zinc-400">
                    {sheet.fileUrl ? `ไฟล์ ${sheet.fileType} แสดงตัวอย่างในเบราว์เซอร์ไม่ได้ — ดาวน์โหลดเพื่อเปิดอ่าน` : "ไม่มีตัวอย่างเอกสาร"}
                  </div>
                )}
              </div>

              {/* FILE INFO */}
              <div className="mt-4 min-w-0">
                <p className="truncate text-sm font-semibold text-zinc-900">{sheet.fileName}</p>
                <p className="text-xs text-zinc-500">{sizeLabel(sheet.fileSize)}</p>
              </div>

              {/* ACTION BUTTONS */}
              <div className="mt-5 space-y-2.5">
                <Link href={`/sheets/${sheet.id}/viewer`} className="flex w-full items-center justify-center rounded-xl bg-[#883d5e] py-3 text-sm font-semibold text-white hover:bg-[#71314d]">
                  เปิดอ่านเอกสารฉบับเต็ม
                </Link>
                <div className="grid grid-cols-2 gap-2.5">
                  {sheet.fileUrl && (
                    <a href={sheet.fileUrl} className="flex items-center justify-center rounded-xl border border-zinc-200 bg-white py-2.5 text-xs font-semibold text-zinc-800 hover:bg-zinc-50">
                      ดาวน์โหลด {sheet.fileType}
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => favorites.toggle(sheet.id)}
                    disabled={favorites.busyId === sheet.id}
                    className={`rounded-xl border py-2.5 text-xs font-semibold transition disabled:opacity-60 ${favorites.isSaved(sheet.id)
                      ? "border-[#883d5e]/30 bg-[#883d5e]/10 text-[#883d5e]"
                      : "border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50"
                      }`}
                  >
                    {favorites.isSaved(sheet.id) ? "บันทึกชีทแล้ว" : "บันทึกชีท"}
                  </button>
                  {sheet.isOwner && (
                    <Link href={`/my-sheets/${sheet.id}/edit`} className="flex items-center justify-center rounded-xl border border-zinc-200 bg-white py-2.5 text-xs font-semibold text-zinc-800 hover:bg-zinc-50">
                      แก้ไขชีทของฉัน
                    </Link>
                  )}
                </div>
                {favorites.error && <p className="text-xs text-red-500">{favorites.error}</p>}
              </div>
            </div>
          </div>

          {/* RIGHT: INFORMATION */}
          <div className="space-y-6 lg:col-span-7">
            <article className="sheet-surface rounded-2xl p-6 sm:p-7">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full bg-[#883d5e]/10 px-3 py-1 font-semibold text-[#883d5e]">{sheet.category}</span>
                <span className="text-zinc-400">อัปเดต {new Date(sheet.updatedAt).toLocaleDateString("th-TH")}</span>
              </div>

              <h1 className="mt-4 text-xl font-bold leading-snug tracking-tight text-zinc-900 sm:text-2xl">{sheet.title}</h1>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-zinc-600">{sheet.description || "ไม่มีคำอธิบาย"}</p>

              {/* SHEET STATS */}
              <dl className="mt-6 grid grid-cols-3 divide-x divide-zinc-200/80 rounded-xl bg-zinc-50/90 py-4 text-center">
                <div>
                  <dt className="text-xs text-zinc-500">วิชา</dt>
                  <dd className="mt-1 px-2 text-sm font-bold text-zinc-900">{sheet.subjectName}</dd>
                </div>
                <div>
                  <dt className="text-xs text-zinc-500">ชนิดไฟล์</dt>
                  <dd className="mt-1 text-sm font-bold text-zinc-900">{sheet.fileType || "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-zinc-500">ขนาดไฟล์</dt>
                  <dd className="mt-1 text-sm font-bold text-zinc-900">{sizeLabel(sheet.fileSize)}</dd>
                </div>
              </dl>

              {/* AUTHOR */}
              <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-zinc-100 pt-5">
                <div className="flex items-center gap-3.5">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#883d5e]/10 text-xs font-bold text-[#883d5e]">
                    {sheet.author.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- avatar from our API
                      <img src={sheet.author.avatarUrl} alt={sheet.author.name} className="h-full w-full object-cover" />
                    ) : (
                      initials(sheet.author.name)
                    )}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-zinc-900">{sheet.author.name}</p>
                    <p className="text-xs text-zinc-500">ผู้สร้างชีท</p>
                  </div>
                </div>
              </div>

              <div className="mt-6 rounded-xl bg-zinc-50 p-4 text-xs leading-relaxed text-zinc-500">
                <strong className="font-semibold text-zinc-700">ข้อจำกัดการใช้งาน:</strong>{" "}
                เอกสารนี้จัดทำขึ้นเพื่อช่วยทบทวนบทเรียน ควรตรวจสอบความถูกต้องกับเอกสารประกอบการเรียนและคำแนะนำของอาจารย์ผู้สอน
              </div>
            </article>

            {/* REACTIONS: click to like / dislike, click again to remove (BE02) */}
            <article className="sheet-surface rounded-2xl p-6 sm:p-7">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-zinc-900">ผลตอบรับจากนักศึกษา</h2>
                <span className="text-xs text-zinc-500">ผู้เข้าชม {sheet.stats.views.toLocaleString()} ครั้ง</span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2.5">
                {([
                  { key: "like", label: "ถูกใจ", count: sheet.stats.likes },
                  { key: "dislike", label: "ไม่ถูกใจ", count: sheet.stats.dislikes },
                ] as const).map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => handleReaction(item.key)}
                    disabled={reactionBusy}
                    aria-pressed={sheet.myReaction === item.key}
                    className={`rounded-xl border p-3.5 text-left transition disabled:opacity-60 ${sheet.myReaction === item.key
                      ? "border-[#883d5e]/30 bg-[#883d5e]/8"
                      : "border-zinc-200/70 bg-zinc-50/70 hover:bg-zinc-100/70"
                      }`}
                  >
                    <span className="block text-xs text-zinc-500">{item.label}{sheet.myReaction === item.key && " (คุณ)"}</span>
                    <span className="mt-1 block text-base font-bold text-zinc-900">{item.count.toLocaleString()}</span>
                  </button>
                ))}
              </div>
              {reactionError ? (
                <p className="mt-3 text-xs text-red-500">{reactionError}</p>
              ) : (
                viewer.ready && !viewer.userId && <p className="mt-3 text-xs text-zinc-400">เข้าสู่ระบบเพื่อกดถูกใจ / ไม่ถูกใจ</p>
              )}
            </article>
          </div>
        </section>

        {/* COMMENTS (BE02) */}
        <section className="sheet-surface mt-9 rounded-2xl p-6 sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-bold text-zinc-900">ความคิดเห็นและการพูดคุย ({commentCount ?? sheet.stats.comments})</h2>
            <span className="text-xs text-zinc-500">เรียงจากเก่าไปใหม่</span>
          </div>
          <SheetComments sheetId={sheet.id} sheetAuthorId={sheet.author.id} onCountChange={setCommentCount} />
        </section>

        {/* RELATED SHEETS */}
        <section className="mt-9">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-bold text-zinc-900">ชีทอื่นในวิชาเดียวกัน</h2>
            <Link href="/discover" className="text-xs font-semibold text-[#883d5e] hover:underline">ดูทั้งหมด</Link>
          </div>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {related.map((item) => (
              <Link key={item.id} href={`/sheets/${item.id}`} className="sheet-surface group overflow-hidden rounded-2xl transition hover:-translate-y-0.5">
                <div className="relative h-40 overflow-hidden bg-zinc-100">
                  {item.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- image served by our API
                    <img src={item.thumbnailUrl} alt={item.title} className="h-full w-full object-cover transition duration-300 group-hover:scale-105" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-zinc-400">ไม่มีรูปตัวอย่าง</div>
                  )}
                  <span className="absolute right-3 top-3 rounded-md bg-white/95 px-2 py-0.5 text-[11px] font-semibold text-zinc-900">{item.subjectName}</span>
                </div>
                <div className="p-4">
                  <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-zinc-900 group-hover:text-[#883d5e]">{item.title}</h3>
                  <div className="mt-3 flex items-center justify-between text-xs text-zinc-500">
                    <span>เข้าชม {item.views.toLocaleString()}</span>
                    <span>ถูกใจ {item.likes.toLocaleString()}</span>
                  </div>
                </div>
              </Link>
            ))}
            {related.length === 0 && <p className="col-span-full py-8 text-center text-sm text-zinc-400">ยังไม่มีชีทอื่นในวิชาเดียวกัน</p>}
          </div>
        </section>
      </main>

      {/* FOOTER */}
      <footer className="border-t border-zinc-200/80 bg-white">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 px-4 py-10 text-xs text-zinc-500 sm:grid-cols-3 sm:px-6">
          <div>
            <p className="text-sm font-bold text-zinc-900">SheetDeedee</p>
            <p className="mt-2 leading-relaxed">แพลตฟอร์มแบ่งปันสรุปบทเรียนสำหรับนักศึกษา เพื่อให้การทบทวนความรู้เป็นเรื่องง่ายและเข้าถึงได้</p>
          </div>
          <div>
            <p className="font-semibold text-zinc-900">แพลตฟอร์ม</p>
            <ul className="mt-2.5 space-y-1.5">
              <li><Link href="/discover" className="hover:text-zinc-900">ค้นหาชีทสรุป</Link></li>
              <li><Link href="/upload" className="hover:text-zinc-900">อัปโหลดชีท</Link></li>
              <li><Link href="/my-sheets" className="hover:text-zinc-900">คลังชีทของฉัน</Link></li>
            </ul>
          </div>
          <div>
            <p className="font-semibold text-zinc-900">ติดต่อทีมงาน</p>
            <p className="mt-2.5 leading-relaxed">มีข้อสงสัยหรือปัญหาการใช้งาน ติดต่อได้ที่<span className="mt-1 block font-medium text-zinc-800">LINE: @sheetdeedee</span></p>
          </div>
        </div>
      </footer>
    </div>
  );
}
