"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { qs, type Paged } from "@/lib/api";
import s from "./admin.module.css";

export type Filters = Record<string, string | number | boolean | null | undefined>;
export const errorText = (e: unknown, fallback = "Request failed.") => e instanceof Error ? e.message : fallback;

/**
 * Debounced, paged, sortable AJAX search. Changing a filter returns to page 1; stale responses
 * are discarded so fast typing never shows results for an older query.
 */
export function usePaged<T>(load: (query: string) => Promise<Paged<T>>, filters: Filters, init: { pageSize?: number; sort?: string; dir?: "asc" | "desc" } = {}) {
  const [sort, setSortState] = useState({ sort: init.sort ?? "", dir: init.dir ?? "desc" as "asc" | "desc" });
  const filterKey = qs({ ...filters, sort: sort.sort, dir: sort.dir });
  const [paging, setPaging] = useState({ key: filterKey, page: 1 });
  const page = paging.key === filterKey ? paging.page : 1;
  const [data, setData] = useState<Paged<T> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [nonce, setNonce] = useState(0);
  const pageSize = init.pageSize ?? 25;
  const query = qs({ ...filters, sort: sort.sort, dir: sort.dir, page, pageSize });

  useEffect(() => {
    let current = true;
    const timer = setTimeout(() => {
      setLoading(true);
      load(query)
        .then(d => { if (current) { setData(d); setError(""); } })
        .catch(e => { if (current) setError(errorText(e, "Could not load results.")); })
        .finally(() => { if (current) setLoading(false); });
    }, 250);
    return () => { current = false; clearTimeout(timer); };
  }, [load, query, nonce]);

  const setPage = useCallback((p: number) => setPaging({ key: filterKey, page: p }), [filterKey]);
  const toggleSort = useCallback((column: string) => setSortState(prev =>
    prev.sort === column ? { sort: column, dir: prev.dir === "asc" ? "desc" : "asc" } : { sort: column, dir: "asc" }), []);
  const reload = useCallback(() => setNonce(n => n + 1), []);

  return { data, items: data?.items ?? [], total: data?.total ?? 0, page, pageSize, loading, error, setPage, sort, toggleSort, reload,
    exportQuery: qs({ ...filters, sort: sort.sort, dir: sort.dir, page: 1, pageSize: 200 }) };
}

export function SortTh({ column, label, sort, onSort }: { column: string; label: string; sort: { sort: string; dir: string }; onSort: (c: string) => void }) {
  const active = sort.sort === column;
  return (
    <th aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" className={s.sortBtn} onClick={() => onSort(column)}>
        {label}<span aria-hidden="true">{active ? (sort.dir === "asc" ? " ▲" : " ▼") : " ↕"}</span>
      </button>
    </th>
  );
}

export function Pager({ page, pageSize, total, loading, onPage }: { page: number; pageSize: number; total: number; loading: boolean; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  return (
    <div className={s.pager} aria-live="polite">
      <span>{loading ? "Loading…" : `${from.toLocaleString()}–${Math.min(page * pageSize, total).toLocaleString()} of ${total.toLocaleString()}`}</span>
      <div>
        <button type="button" className={s.ghost} disabled={page <= 1} onClick={() => onPage(1)} aria-label="First page">«</button>
        <button type="button" className={s.ghost} disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button>
        <span>Page {page} / {pages}</span>
        <button type="button" className={s.ghost} disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</button>
        <button type="button" className={s.ghost} disabled={page >= pages} onClick={() => onPage(pages)} aria-label="Last page">»</button>
      </div>
    </div>
  );
}

export function FilterBar({ children, onClear, active }: { children: ReactNode; onClear: () => void; active: number }) {
  return (
    <div className={`${s.card} ${s.filterBar}`} role="search">
      <div className={s.filterGrid}>{children}</div>
      <div className={s.filterFoot}>
        <span>{active ? `${active} filter${active > 1 ? "s" : ""} active` : "No filters"}</span>
        <button type="button" className={s.ghost} onClick={onClear} disabled={!active}>Clear filters</button>
      </div>
    </div>
  );
}

export const countActive = (f: Filters, defaults: Filters = {}) =>
  Object.entries(f).filter(([k, v]) => v !== "" && v !== undefined && v !== null && v !== defaults[k]).length;

// Spreadsheet-safe CSV: quotes every cell and neutralises formula prefixes (CSV injection).
export function downloadCsv(name: string, rows: Record<string, unknown>[], columns: [key: string, header: string][]) {
  const cell = (v: unknown) => {
    let t = v === null || v === undefined ? "" : String(v);
    if (/^[=+\-@\t\r]/.test(t)) t = "'" + t;
    return `"${t.replace(/"/g, '""')}"`;
  };
  const csv = "﻿" + [columns.map(c => cell(c[1])).join(","), ...rows.map(r => columns.map(c => cell(r[c[0]])).join(","))].join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
