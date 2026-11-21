"use client";

import { useEffect, useState } from "react";
import { ErrorBox, Pager, SheetTable } from "../_components";
import { api, type ApiErrorBody, type Pagination, type Sheet } from "../_lib";

// My Sheets → GET /api/v1/users/me/sheets (login required)
export default function TestMySheetsPage() {
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [pagination, setPagination] = useState<Pagination>();
  const [error, setError] = useState<{ body: ApiErrorBody; status: number } | null>(null);

  useEffect(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: "10" });
    if (status) params.set("status", status);
    api<Sheet[]>(`/api/v1/users/me/sheets?${params}`).then((result) => {
      if (result.ok) {
        setSheets(result.data);
        setPagination(result.pagination);
        setError(null);
      } else {
        setSheets([]);
        setPagination(undefined);
        setError({ body: result.error, status: result.status });
      }
    });
  }, [status, page]);

  return (
    <main>
      <h1>ชีทของฉัน</h1>
      <label>
        กรองสถานะ{" "}
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="">ทั้งหมด</option>
          <option value="published">เผยแพร่</option>
          <option value="draft">ร่าง</option>
          <option value="hidden">ซ่อน</option>
        </select>
      </label>
      <ErrorBox error={error?.body ?? null} status={error?.status} />
      {!error && <SheetTable sheets={sheets} />}
      <Pager pagination={pagination} onPage={setPage} />
    </main>
  );
}
