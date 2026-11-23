"use client";

// Comments section of the sheet detail page (FE01 design) wired to BE02:
// list + new comment, reply to a top-level comment, delete your own comment.
// Not available in the backend (so not shown): liking a comment.
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";

import { initials } from "@/lib/api-client";
import type { SheetComment } from "@/types/interaction";

import { useComments, useViewer } from "./useInteractions";

type Props = {
  sheetId: string;
  sheetAuthorId: string;
  /** Called with the new visible count after it changes (keeps the page header in sync). */
  onCountChange?: (count: number) => void;
};

const MAX = 5000;

export default function SheetComments({ sheetId, sheetAuthorId, onCountChange }: Props) {
  const { userId, ready } = useViewer();
  const { comments, loadError, count, add, reply, remove } = useComments(sheetId);

  const [text, setText] = useState("");
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [rowError, setRowError] = useState<{ id: string; text: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function after(result: Promise<string>, onOk: () => void, errorId?: string) {
    const error = await result;
    if (error) {
      if (errorId) setRowError({ id: errorId, text: error });
      else setFormError(error);
      return;
    }
    onOk();
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!text.trim() || submitting) return;
    setSubmitting(true);
    setFormError("");
    await after(add(text.trim()), () => setText(""));
    setSubmitting(false);
  }

  async function submitReply(e: FormEvent<HTMLFormElement>, commentId: string) {
    e.preventDefault();
    if (!replyText.trim() || busyId) return;
    setBusyId(commentId);
    setRowError(null);
    await after(reply(commentId, replyText.trim()), () => {
      setReplyText("");
      setReplyTo(null);
    }, commentId);
    setBusyId(null);
  }

  async function removeComment(commentId: string) {
    if (busyId || !window.confirm("ลบความคิดเห็นนี้ใช่ไหม? (ลบแล้วกู้คืนไม่ได้)")) return;
    setBusyId(commentId);
    setRowError(null);
    await after(remove(commentId), () => {}, commentId);
    setBusyId(null);
  }

  // Report the count to the page whenever it changes after loading.
  useEffect(() => {
    if (count !== null) onCountChange?.(count);
  }, [count, onCountChange]);

  function renderComment(c: SheetComment, isReply: boolean) {
    const mine = userId !== null && c.authorId === userId;
    return (
      <div key={c.id} className={isReply ? "mt-3 border-l-2 border-zinc-100 pl-4" : "py-4 first:pt-1 last:pb-1"}>
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-zinc-100 text-xs font-semibold text-zinc-700">
            {c.authorImage ? (
              // eslint-disable-next-line @next/next/no-img-element -- avatar from our API
              <img src={c.authorImage} alt={c.authorName} className="h-full w-full object-cover" />
            ) : (
              initials(c.authorName)
            )}
          </span>
          <div className="text-xs">
            <span className="font-semibold text-zinc-900">{c.authorName}</span>
            {c.authorId === sheetAuthorId && (
              <span className="ml-2 rounded bg-[#883d5e]/10 px-2 py-0.5 text-[11px] font-medium text-[#883d5e]">ผู้สร้างชีท</span>
            )}
            <span className="ml-2 text-zinc-400">{new Date(c.createdAt).toLocaleString("th-TH")}</span>
          </div>
        </div>

        <p className={`mt-2 whitespace-pre-wrap break-words pl-10 text-sm leading-relaxed ${c.deleted ? "italic text-zinc-400" : "text-zinc-700"}`}>
          {c.deleted ? "ความคิดเห็นนี้ถูกลบแล้ว" : c.body}
        </p>

        {!c.deleted && userId && (
          <div className="mt-2 flex gap-4 pl-10 text-xs text-zinc-500">
            {!isReply && (
              <button type="button" onClick={() => { setReplyTo(replyTo === c.id ? null : c.id); setReplyText(""); setRowError(null); }} className="hover:text-zinc-900">
                {replyTo === c.id ? "ยกเลิก" : "ตอบกลับ"}
              </button>
            )}
            {mine && (
              <button type="button" onClick={() => removeComment(c.id)} disabled={busyId === c.id} className="hover:text-red-600 disabled:opacity-50">
                ลบ
              </button>
            )}
          </div>
        )}

        {rowError?.id === c.id && <p className="mt-2 pl-10 text-xs text-red-500">{rowError.text}</p>}

        {!isReply && (c.replies.length > 0 || replyTo === c.id) && (
          <div className="ml-10 mt-1">
            {c.replies.map((r) => renderComment(r, true))}
            {replyTo === c.id && (
              <form onSubmit={(e) => submitReply(e, c.id)} className="mt-3 flex gap-2">
                <input
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  maxLength={MAX}
                  autoFocus
                  placeholder={`ตอบกลับ ${c.authorName}...`}
                  className="min-w-0 flex-1 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-[#883d5e] focus:outline-none"
                />
                <button type="submit" disabled={busyId === c.id || !replyText.trim()} className="rounded-xl bg-[#883d5e] px-4 py-2 text-xs font-semibold text-white hover:bg-[#71314d] disabled:cursor-not-allowed disabled:opacity-50">
                  {busyId === c.id ? "กำลังส่ง..." : "ส่ง"}
                </button>
              </form>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      {/* COMMENT FORM (guests see a sign-in link) */}
      {ready && !userId ? (
        <div className="mt-5 rounded-xl bg-zinc-50/90 p-4 text-center text-sm text-zinc-500">
          <Link href="/login" className="font-semibold text-[#883d5e] hover:underline">เข้าสู่ระบบ</Link> เพื่อแสดงความคิดเห็น
        </div>
      ) : (
        <form onSubmit={submit} className="mt-5 rounded-xl bg-zinc-50/90 p-4">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            maxLength={MAX}
            placeholder="เขียนความคิดเห็นหรือสอบถามเพิ่มเติมเกี่ยวกับชีทนี้..."
            className="w-full resize-y rounded-xl border border-zinc-200 bg-white p-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-[#883d5e] focus:outline-none"
          />
          <div className="mt-3 flex items-center justify-end gap-3">
            {formError && <p className="mr-auto text-xs text-red-500">{formError}</p>}
            <button type="submit" disabled={submitting || !text.trim()} className="rounded-xl bg-[#883d5e] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#71314d] disabled:cursor-not-allowed disabled:opacity-50">
              {submitting ? "กำลังส่ง..." : "ส่งความคิดเห็น"}
            </button>
          </div>
        </form>
      )}

      {/* COMMENT LIST */}
      <div className="mt-6 divide-y divide-zinc-100">
        {loadError ? (
          <p className="py-8 text-center text-sm text-red-500">{loadError}</p>
        ) : comments === null ? (
          <p className="py-8 text-center text-sm text-zinc-400">กำลังโหลดความคิดเห็น...</p>
        ) : comments.length === 0 ? (
          <p className="py-8 text-center text-sm text-zinc-400">ยังไม่มีความคิดเห็น เป็นคนแรกที่แสดงความคิดเห็นสิ!</p>
        ) : (
          comments.map((c) => renderComment(c, false))
        )}
      </div>
    </>
  );
}
