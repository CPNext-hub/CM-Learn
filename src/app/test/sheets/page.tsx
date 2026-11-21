"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ErrorBox, LookupSelect, Pager, SheetTable, useLookups } from "../_components";
import { api, type ApiErrorBody, type Pagination, type Sheet } from "../_lib";

// Home / Search / Filter → GET /api/v1/sheets
export default function TestSheetsPage() {
  const { subjects, categories } = useLookups();
  const [query, setQuery] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [pagination, setPagination] = useState<Pagination>();
  const [error, setError] = useState<{ body: ApiErrorBody; status: number } | null>(null);
  const [requestUrl, setRequestUrl] = useState("");

  const load = useCallback(async () => {
    const params = new URLSearchParams({ ...query, page: String(page), pageSize: "5" });
    for (const [key, value] of [...params.entries()]) if (!value) params.delete(key);
    const url = `/api/v1/sheets?${params}`;
    setRequestUrl(url);
    const result = await api<Sheet[]>(url);
    if (result.ok) {
      setSheets(result.data);
      setPagination(result.pagination);
      setError(null);
    } else {
      setError({ body: result.error, status: result.status });
    }
  }, [query, page]);

  useEffect(() => {
    load();
  }, [load]);

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setQuery({
      q: String(form.get("q") ?? ""),
      subjectId: String(form.get("subjectId") ?? ""),
      categoryId: String(form.get("categoryId") ?? ""),
      sort: String(form.get("sort") ?? "newest"),
    });
    setPage(1);
  }

  return (
    <main>
      <h1>ชีททั้งหมด (เฉพาะที่เผยแพร่)</h1>
      <form onSubmit={handleSearch}>
        <label>
          ค้นหา <input name="q" placeholder="ชื่อหรือคำอธิบาย" />
        </label>{" "}
        <LookupSelect name="subjectId" label="วิชา" options={subjects} />{" "}
        <LookupSelect name="categoryId" label="หมวดหมู่" options={categories} />{" "}
        <label>
          เรียง{" "}
          <select name="sort" defaultValue="newest">
            <option value="newest">ใหม่สุด</option>
            <option value="popular">ยอดดูมากสุด</option>
          </select>
        </label>{" "}
        <button type="submit">ค้นหา</button>
      </form>
      <p>
        <small>
          เรียก: <code>GET {requestUrl}</code>
        </small>
      </p>
      <ErrorBox error={error?.body ?? null} status={error?.status} />
      <SheetTable sheets={sheets} />
      <Pager pagination={pagination} onPage={setPage} />
    </main>
  );
}
