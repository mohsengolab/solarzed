"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { qs, fa, type Paged } from "@/lib/api";
import s from "./admin.module.css";
import { downloadXlsx, type Cell } from "@/lib/xlsx";

export type Filters = Record<string, string | number | boolean | null | undefined>;
export const errorText = (e: unknown, fallback = "درخواست ناموفق بود.") => e instanceof Error ? e.message : fallback;

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
        .catch(e => { if (current) setError(errorText(e, "بارگذاری نتایج ناموفق بود.")); })
        .finally(() => { if (current) setLoading(false); });
    }, 250);
    return () => { current = false; clearTimeout(timer); };
  }, [load, query, nonce]);

  const setPage = useCallback((p: number) => setPaging({ key: filterKey, page: p }), [filterKey]);
  const toggleSort = useCallback((column: string) => setSortState(prev =>
    prev.sort === column ? { sort: column, dir: prev.dir === "asc" ? "desc" : "asc" } : { sort: column, dir: "asc" }), []);
  const setSort = useCallback((column: string, dir: "asc" | "desc") => setSortState({ sort: column, dir }), []);
  const reload = useCallback(() => setNonce(n => n + 1), []);

  return { data, items: data?.items ?? [], total: data?.total ?? 0, page, pageSize, loading, error, setPage, sort, toggleSort, setSort, reload,
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
  const number = (n: number) => n.toLocaleString("fa-IR");
  return (
    <div className={s.pager} aria-live="polite">
      <span>{loading ? fa("Loading…") : `${number(from)}–${number(Math.min(page * pageSize, total))} ${fa("of")} ${number(total)}`}</span>
      <div>
        <button type="button" className={s.ghost} disabled={page <= 1} onClick={() => onPage(1)} aria-label={fa("First page")}>«</button>
        <button type="button" className={s.ghost} disabled={page <= 1} onClick={() => onPage(page - 1)}>{fa("Previous")}</button>
        <span>{fa("Page ")}{number(page)} / {number(pages)}</span>
        <button type="button" className={s.ghost} disabled={page >= pages} onClick={() => onPage(page + 1)}>{fa("Next")}</button>
        <button type="button" className={s.ghost} disabled={page >= pages} onClick={() => onPage(pages)} aria-label={fa("Last page")}>»</button>
      </div>
    </div>
  );
}

export function FilterBar({ children, onClear, active }: { children: ReactNode; onClear: () => void; active: number }) {
  return (
    <div className={`${s.card} ${s.filterBar}`} role="search">
      <div className={s.filterGrid}>{children}</div>
      <div className={s.filterFoot}>
        <span>{active ? `${active.toLocaleString("fa-IR")} ${fa(active > 1 ? "filters active" : "filter active")}` : fa("No filters")}</span>
        <button type="button" className={s.ghost} onClick={onClear} disabled={!active}>{fa("Clear filters")}</button>
      </div>
    </div>
  );
}

export const countActive = (f: Filters, defaults: Filters = {}) =>
  Object.entries(f).filter(([k, v]) => v !== "" && v !== undefined && v !== null && v !== defaults[k]).length;

/** Excel (.xlsx) export: one column per field, header in bold, right-to-left sheet. */
export function downloadExcel(name: string, rows: Record<string, unknown>[], columns: [key: string, header: string][]) {
  const value = (v: unknown): Cell => v === null || v === undefined ? "" : typeof v === "number" || typeof v === "boolean" ? v : String(v);
  downloadXlsx(name, columns.map(c => c[1]), rows.map(r => columns.map(c => value(r[c[0]]))));
}
