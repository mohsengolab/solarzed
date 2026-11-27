"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useT } from "@/lib/i18n/client";
import own from "./account.module.css";

const PAGE_SIZE = 10;

/** Search text + one filter + paging over a client-side list. Changing the search or filter goes back to page 1. */
export function useListView<T, F extends string>(items: T[], text: (item: T) => string, filterOf: (item: T) => F | null, pageSize = PAGE_SIZE) {
  const [query, setQueryRaw] = useState("");
  const [filter, setFilterRaw] = useState<F | "all">("all");
  const [page, setPage] = useState(1);
  const setQuery = (value: string) => { setQueryRaw(value); setPage(1); };
  const setFilter = (value: F | "all") => { setFilterRaw(value); setPage(1); };

  const counts = useMemo(() => {
    const map = new Map<F, number>();
    for (const item of items) { const f = filterOf(item); if (f) map.set(f, (map.get(f) ?? 0) + 1); }
    return map;
  }, [items, filterOf]);

  const matches = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return items.filter(item => {
      if (filter !== "all" && filterOf(item) !== filter) return false;
      if (!words.length) return true;
      const hay = text(item).toLowerCase();
      return words.every(w => hay.includes(w));
    });
  }, [items, query, filter, text, filterOf]);

  const pages = Math.max(1, Math.ceil(matches.length / pageSize));
  const current = Math.min(page, pages);
  const rows = matches.slice((current - 1) * pageSize, current * pageSize);
  return { query, setQuery, filter, setFilter, counts, matches, rows, page: current, pages, setPage, total: items.length };
}

type View<F extends string> = ReturnType<typeof useListView<unknown, F>>;

/** Search box plus filter chips (with counts) above a list. */
export function ListToolbar<F extends string>({ view, placeholder, filters, children }: {
  view: Pick<View<F>, "query" | "setQuery" | "filter" | "setFilter" | "counts" | "total">;
  placeholder: string;
  filters?: readonly (readonly [F, string])[];
  children?: ReactNode;
}) {
  const t = useT();
  return <div className={own.toolbar}>
    <label className={own.search}>
      <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16"><path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm9 2-4-4" /></svg>
      <input type="search" aria-label={placeholder} placeholder={placeholder} value={view.query} onChange={e => view.setQuery(e.target.value)} />
    </label>
    {filters && <div className={own.chips} role="group" aria-label={t("Filter")}>
      <button type="button" className={own.chip} aria-pressed={view.filter === "all"} onClick={() => view.setFilter("all")}>{t("All")} <span>{view.total}</span></button>
      {filters.map(([id, label]) => <button key={id} type="button" className={own.chip} aria-pressed={view.filter === id} onClick={() => view.setFilter(id)}>
        {label} <span>{view.counts.get(id) ?? 0}</span>
      </button>)}
    </div>}
    {children}
  </div>;
}

export function Pager({ page, pages, setPage, shown, matched }: { page: number; pages: number; setPage: (p: number) => void; shown: number; matched: number }) {
  const t = useT();
  if (matched === 0) return null;
  return <div className={own.pager}>
    <span>{t(matched === 1 ? "{n} result" : "{n} results", { n: matched })}{pages > 1 && ` · ${t("showing {n}", { n: shown })}`}</span>
    {pages > 1 && <span className={own.pagerButtons}>
      <button type="button" className={own.ghost} disabled={page <= 1} onClick={() => setPage(page - 1)}>{t("‹ Prev")}</button>
      <b>{page} / {pages}</b>
      <button type="button" className={own.ghost} disabled={page >= pages} onClick={() => setPage(page + 1)}>{t("Next ›")}</button>
    </span>}
  </div>;
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return <div className={own.empty}><b>{title}</b>{children}</div>;
}
