const BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

export async function apiFetch<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    // Admin sessions use an HttpOnly cookie; the custom header is required by the API's CSRF check.
    credentials: "include",
    cache: "no-store",
    headers: { "Content-Type": "application/json", "X-Requested-With": "fetch", ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    if (res.status === 401 && path.startsWith("/api/admin/") && path !== "/api/admin/login" && typeof window !== "undefined")
      window.dispatchEvent(new Event(ADMIN_UNAUTHORIZED));
    throw new Error(body.error ?? (res.status === 401 ? "Your session has ended. Please sign in again." : `HTTP ${res.status}`));
  }
  return res.json();
}

export const ADMIN_UNAUTHORIZED = "solarzed:admin-unauthorized";

export interface Paged<T> { items: T[]; total: number; page: number; pageSize: number }

/** Builds a query string, skipping empty values. */
export function qs(params: Record<string, string | number | boolean | null | undefined>) {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== "" && v !== null && v !== undefined) search.set(k, String(v));
  const text = search.toString();
  return text ? `?${text}` : "";
}

// ── Public ───────────────────────────────────────────────────────────────────

export interface WarrantyPublic {
  code: string;
  type: "tint" | "ppf";
  make: string;
  model: string;
  vinMasked: string;
  plate: string;
  filmSerial: string;
  invoiceNumber: string;
  installed: string;
  sellerName: string;
  sellerPhoneMasked: string;
  installer: string;
  areas: string[];
  status: "pending" | "active" | "rejected";
  statusLabel: string;
  statusNote?: string;
  coverage?: { filmEnds?: string; installEnds?: string };
  flags: string[];
}

export interface LookupResult {
  records: WarrantyPublic[];
}

export function lookupWarranty(q: string): Promise<LookupResult> {
  return apiFetch(`/api/warranty?q=${encodeURIComponent(q)}`);
}

export function registerWarranty(data: Record<string, unknown>) {
  return apiFetch<{ code: string; flags: string[] }>("/api/warranty/register", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// ── Admin ────────────────────────────────────────────────────────────────────

// The session lives in an HttpOnly cookie set by the API, so scripts never see the token.
export function adminSession() { return apiFetch<{ username: string }>("/api/admin/session"); }
export function adminLogout() { return apiFetch<{ ok: boolean }>("/api/admin/logout", { method: "POST" }); }

export function managementFetch<T>(path: string, data?: unknown, method = "POST") {
  return apiFetch<T>(`/api/admin/${path}`, data === undefined && method === "POST" ? {} :
    { method, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
}

export function adminLogin(username: string, password: string) {
  return apiFetch<{ token: string; username: string }>("/api/admin/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export function adminOverview() {
  return apiFetch("/api/admin/overview");
}

export function adminWarranties<T>(query: string) {
  return apiFetch<Paged<T>>(`/api/admin/warranties${query}`);
}

export function adminDecision(code: string, status: string, note?: string) {
  return apiFetch(`/api/admin/warranties/${encodeURIComponent(code)}/decision`, {
    method: "POST",
    body: JSON.stringify({ status, note }),
  });
}

export function adminRollsSearch<T>(query: string) {
  return apiFetch<Paged<T>>(`/api/admin/rolls${query}`);
}

/** Most recent 200 rolls (used by box labels). */
export async function adminRolls() {
  return (await apiFetch<Paged<unknown>>("/api/admin/rolls?pageSize=200")).items;
}

export function adminCreateRolls(data: Record<string, unknown>) {
  return apiFetch("/api/admin/rolls", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function adminGetSettings() {
  return apiFetch("/api/admin/settings");
}

export function adminSaveSettings(data: Record<string, unknown>) {
  return apiFetch("/api/admin/settings", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export interface BoxLabel {
  id: string; rollId: string; product: string; type: "tint" | "ppf";
  filmYears: number; installYears: number | null; createdAt: string;
  activatedAt: string | null; warrantyCode: string | null; activationUrl: string;
}
export interface BoxLabelsResult { labels: BoxLabel[]; siteUrl: string; smsConfigured: boolean }
export function adminBoxLabels() { return apiFetch<BoxLabelsResult>("/api/admin/box-labels"); }
export function issueBoxLabels(rollId: string, quantity: number) {
  return apiFetch<{ labels: BoxLabel[] }>("/api/admin/box-labels", { method: "POST", body: JSON.stringify({ rollId, quantity }) });
}
export function saveLabelSite(siteUrl: string) {
  return apiFetch("/api/admin/box-labels/site", { method: "POST", body: JSON.stringify({ siteUrl }) });
}
export function releaseRoll(id: string) {
  return apiFetch(`/api/admin/rolls/${encodeURIComponent(id)}`, { method: "POST", body: JSON.stringify({ status: "shipped", note: "Released by admin for box QR activation" }) });
}
export interface ActivationInfo { id: string; product: string; type: "tint" | "ppf"; activated: boolean; filmYears: number; installYears: number | null; smsAvailable: boolean; released: boolean }
export function inspectBox(token: string) {
  return apiFetch<ActivationInfo>("/api/activation/inspect", { method: "POST", body: JSON.stringify({ token }) });
}
export function sendActivationOtp(token: string, phone: string) {
  return apiFetch<{ challengeId: string; expiresAt: string; retryAfterSeconds: number }>("/api/activation/otp", { method: "POST", body: JSON.stringify({ token, phone }) });
}
export function completeActivation(token: string, challengeId: string, otp: string, registration: Record<string, unknown>) {
  return apiFetch<WarrantyPublic>("/api/activation/complete", { method: "POST", body: JSON.stringify({ token, challengeId, otp, registration }) });
}
