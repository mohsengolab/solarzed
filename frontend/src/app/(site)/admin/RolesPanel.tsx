"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { adminPermissions, adminSavePermissions, fa, type EditableRole, type PermissionPage, type RolePermissions } from "@/lib/api";
import { errorText } from "./AdminKit";
import s from "./admin.module.css";
import r from "./roles.module.css";

// ── What the signed-in staff member may do ────────────────────────────────────
// The API enforces every permission; the UI uses the same list only to hide what would be refused.

const PermsContext = createContext<ReadonlySet<string>>(new Set());
export const PermsProvider = PermsContext.Provider;

/** `can("rolls.edit")` — true when the signed-in role has that permission. */
export function useCan() {
  const perms = useContext(PermsContext);
  return useCallback((key: string) => perms.has(key), [perms]);
}

// ── Super administrator: choose each role's pages and actions ─────────────────

const ROLE_NAMES: Record<EditableRole, { name: string; hint: string }> = {
  admin: { name: "مدیر", hint: "مدیرانی که نقش «مدیر» دارند" },
  counter: { name: "کانتر", hint: "کاربرانی که نقش «کانتر» دارند" },
};

const viewKey = (page: PermissionPage) => page.items.find(i => i.key.endsWith(".view"))?.key;
const same = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every(k => b.has(k));

export function RolesPanel() {
  const [data, setData] = useState<RolePermissions | null>(null);
  const [role, setRole] = useState<EditableRole>("admin");
  const [draft, setDraft] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    adminPermissions().then(d => { setData(d); setDraft(new Set(d.roles.admin)); })
      .catch(e => setMsg({ ok: false, text: fa(errorText(e)) }));
  }, []);

  const saved = useMemo(() => new Set(data?.roles[role] ?? []), [data, role]);
  const dirty = data != null && !same(draft, saved);

  function pickRole(next: EditableRole) {
    if (next === role || !data) return;
    if (dirty && !window.confirm("تغییرات این نقش ذخیره نشده است. بدون ذخیره ادامه می‌دهید؟")) return;
    setRole(next); setDraft(new Set(data.roles[next])); setMsg(null);
  }

  function toggle(page: PermissionPage, key: string) {
    const next = new Set(draft);
    const view = viewKey(page);
    if (next.has(key)) {
      next.delete(key);
      // Without the page, none of its actions make sense.
      if (key === view) page.items.forEach(i => next.delete(i.key));
    } else {
      next.add(key);
      if (view) next.add(view);
    }
    setDraft(next); setMsg(null);
  }

  function togglePage(page: PermissionPage) {
    const next = new Set(draft);
    const anyOn = page.items.some(i => next.has(i.key));
    page.items.forEach(i => (anyOn ? next.delete(i.key) : next.add(i.key)));
    setDraft(next); setMsg(null);
  }

  async function save() {
    setBusy(true); setMsg(null);
    try {
      const res = await adminSavePermissions(role, [...draft]);
      setData(d => d && { ...d, roles: { ...d.roles, [role]: res.permissions } });
      setDraft(new Set(res.permissions));
      setMsg({ ok: true, text: `دسترسی‌های نقش «${ROLE_NAMES[role].name}» ذخیره شد. از درخواست بعدی کاربران این نقش اعمال می‌شود.` });
    } catch (e) { setMsg({ ok: false, text: fa(errorText(e)) }); } finally { setBusy(false); }
  }

  const pagesOn = data ? data.catalog.filter(p => p.items.some(i => draft.has(i.key))).length : 0;

  return <section>
    <header className={s.panelHead}><div><span className={s.eyebrow}>کاربران</span><h1>دسترسی نقش‌ها</h1></div></header>

    <div className={s.reportTabs} role="tablist" aria-label="نقش">
      {(Object.keys(ROLE_NAMES) as EditableRole[]).map(k => (
        <button key={k} type="button" role="tab" aria-selected={role === k} onClick={() => pickRole(k)}
          className={role === k ? s.reportTabActive : s.reportTab}>{ROLE_NAMES[k].name}</button>
      ))}
    </div>

    <div className={s.card}>
      <p className={r.summary}>
        انتخاب کنید {ROLE_NAMES[role].hint} کدام صفحه‌ها را ببینند و در هر صفحه چه کاری انجام دهند.
        «مدیر کل» همیشه به همه چیز دسترسی دارد. فعلاً {pagesOn.toLocaleString("fa-IR")} صفحه برای این نقش باز است.
      </p>
      {!data && !msg && <p className={s.empty}>در حال بارگذاری…</p>}
      {data && <div className={r.grid}>
        {data.catalog.map(page => {
          const on = page.items.some(i => draft.has(i.key));
          return <div key={page.page} className={r.page} data-off={!on}>
            <label className={r.pageName}>
              <input type="checkbox" checked={on} onChange={() => togglePage(page)} aria-label={`همه دسترسی‌های ${page.label}`} />
              <span>{page.label}<small>{on ? `${page.items.filter(i => draft.has(i.key)).length.toLocaleString("fa-IR")} از ${page.items.length.toLocaleString("fa-IR")} مورد` : "پنهان"}</small></span>
            </label>
            <div className={r.items}>
              {page.items.map(item => (
                <label key={item.key} className={r.chip} data-on={draft.has(item.key)} data-kind={item.key.endsWith(".view") ? "view" : "action"}>
                  <input type="checkbox" checked={draft.has(item.key)} onChange={() => toggle(page, item.key)} />
                  {item.label}
                </label>
              ))}
            </div>
          </div>;
        })}
      </div>}

      {data && <div className={r.bar}>
        <button type="button" className={s.btnPrimary} disabled={busy || !dirty} onClick={save}>{busy ? "در حال ذخیره…" : "ذخیره دسترسی‌ها"}</button>
        <button type="button" className={s.ghost} disabled={busy || !dirty} onClick={() => { setDraft(new Set(saved)); setMsg(null); }}>لغو تغییرات</button>
        <button type="button" className={s.ghost} disabled={busy} onClick={() => { setDraft(new Set(data.defaults[role])); setMsg(null); }}>بازگشت به پیش‌فرض</button>
        {dirty && <span className={r.dirty}>تغییرات ذخیره نشده</span>}
      </div>}
      {msg && <p role={msg.ok ? "status" : "alert"} className={msg.ok ? undefined : s.errorText}>{msg.text}</p>}
    </div>
  </section>;
}
