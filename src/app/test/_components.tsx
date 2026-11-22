"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";
import {
  api,
  formatBytes,
  formatDate,
  STATUS_LABEL,
  type ApiErrorBody,
  type Lookup,
  type Pagination,
  type Sheet,
} from "./_lib";

/** Preview for PDF (iframe) or image (img). Other types cannot be shown by the browser. */
export function FilePreview({ url, mimeType }: { url: string | null; mimeType: string }) {
  if (url && mimeType === "application/pdf") {
    return <iframe src={url} title="preview" width="100%" height={500} />;
  }
  if (url && mimeType.startsWith("image/")) {
    // eslint-disable-next-line @next/next/no-img-element -- test page, plain <img> is fine
    return <img src={url} alt="preview" style={{ maxWidth: "100%", maxHeight: 500 }} />;
  }
  return <p>ไฟล์ชนิดนี้ ({mimeType}) แสดงตัวอย่างไม่ได้ — ใช้ปุ่มดาวน์โหลด</p>;
}

/** Table of sheets used by the list and My Sheets pages. */
export function SheetTable({ sheets }: { sheets: Sheet[] }) {
  if (sheets.length === 0) return <p>ไม่พบชีท</p>;
  return (
    <table border={1} cellPadding={4} style={{ borderCollapse: "collapse" }}>
      <thead>
        <tr>
          <th>ชื่อชีท</th>
          <th>สถานะ</th>
          <th>วิชา</th>
          <th>หมวดหมู่</th>
          <th>ผู้สร้าง</th>
          <th>ไฟล์</th>
          <th>ดู / 👍 / 👎 / 💬</th>
          <th>สร้างเมื่อ</th>
        </tr>
      </thead>
      <tbody>
        {sheets.map((s) => (
          <tr key={s.id}>
            <td>
              <Link href={`/test/sheets/${s.id}`}>{s.title}</Link>
            </td>
            <td>{STATUS_LABEL[s.status]}</td>
            <td>{s.subject?.name ?? "-"}</td>
            <td>{s.category?.name ?? "-"}</td>
            <td>{s.owner.name}</td>
            <td>{s.file ? `v${s.file.versionNo} · ${formatBytes(s.file.sizeBytes)}` : "ไม่มีไฟล์"}</td>
            <td>
              {s.viewCount} / {s.likeCount} / {s.dislikeCount} / {s.commentCount}
            </td>
            <td>{formatDate(s.createdAt)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Shows who is logged in, with login/register/logout links. */
export function SessionBar() {
  const { data: session, isPending, refetch } = authClient.useSession();
  const pathname = usePathname();
  // The layout stays mounted during client-side navigation, so the cached session can go stale
  // (expired, logged out in another tab, account deleted). Ask the server again on every page change.
  useEffect(() => {
    refetch();
  }, [pathname, refetch]);
  if (isPending) return <p>กำลังตรวจสอบการเข้าสู่ระบบ...</p>;
  if (!session) {
    return (
      <p>
        ยังไม่ได้เข้าสู่ระบบ — <Link href="/login">เข้าสู่ระบบ</Link> | <Link href="/register">สมัครสมาชิก</Link>
      </p>
    );
  }
  return (
    <p>
      เข้าสู่ระบบเป็น <b>{session.user.name}</b> ({session.user.email}){" "}
      <button type="button" onClick={() => authClient.signOut().then(() => location.reload())}>
        ออกจากระบบ
      </button>
    </p>
  );
}

/** Shows an API error, including per-field details. */
export function ErrorBox({ error, status }: { error: ApiErrorBody | null; status?: number }) {
  if (!error) return null;
  return (
    <div role="alert" style={{ border: "1px solid red", padding: 8, margin: "8px 0" }}>
      <b>
        ผิดพลาด{status ? ` (HTTP ${status})` : ""}: {error.message}
      </b>{" "}
      <code>{error.code}</code>
      {status === 401 && (
        <p>
          session หมดอายุหรือยังไม่ได้เข้าสู่ระบบ — <Link href="/login">เข้าสู่ระบบ</Link> แล้วกลับมาที่หน้านี้
        </p>
      )}
      {error.details && (
        <ul>
          {Object.entries(error.details).map(([field, message]) => (
            <li key={field}>
              {field}: {message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Loads subjects + categories once, for dropdowns. */
export function useLookups() {
  const [subjects, setSubjects] = useState<Lookup[]>([]);
  const [categories, setCategories] = useState<Lookup[]>([]);
  useEffect(() => {
    api<Lookup[]>("/api/v1/subjects").then((r) => r.ok && setSubjects(r.data));
    api<Lookup[]>("/api/v1/categories").then((r) => r.ok && setCategories(r.data));
  }, []);
  return { subjects, categories };
}

export function LookupSelect({
  name,
  label,
  options,
  defaultValue,
}: {
  name: string;
  label: string;
  options: Lookup[];
  defaultValue?: string;
}) {
  return (
    <label>
      {label}{" "}
      <select name={name} defaultValue={defaultValue ?? ""} key={options.length /* re-apply default after load */}>
        <option value="">— ไม่ระบุ —</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Pager({ pagination, onPage }: { pagination?: Pagination; onPage: (page: number) => void }) {
  if (!pagination) return null;
  const { page, totalPages, total } = pagination;
  return (
    <p>
      <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        ← ก่อนหน้า
      </button>{" "}
      หน้า {page} / {totalPages} (ทั้งหมด {total} รายการ){" "}
      <button type="button" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
        ถัดไป →
      </button>
    </p>
  );
}
