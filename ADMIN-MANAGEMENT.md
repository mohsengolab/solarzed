# Management panel

The current application uses `/admin` (Next.js and ASP.NET Core), not the legacy static `/admin.html`.

- **Products:** create, edit, search and archive inventory products. Product codes are immutable. Products with rolls cannot change warranty type. Archive preserves existing rolls, labels and warranties, and blocks new inventory for that model. No sample website products are imported into real stock.
- **Rolls:** select a defined product, receive batches, search stock, change QC/status and inspect the change history. Existing model codes remain supported for compatibility.
- **Public catalog:** `/api/catalog` exposes only active products and their public fields. `/products`, series pages and the header menu read this endpoint through the cached catalog described under Caching. Series are grouped by product type and series name. Product names and descriptions update after saving; archiving removes a product from the public site. Sample series are not used as a fallback for an empty database or an API outage. Set `SOLARZED_API_INTERNAL_URL` on the Next.js server to the internal API origin in production (development fallback: `http://localhost:5010`).
- **Labels:** issue one unique QR per box, print/reprint using configurable paper dimensions, and release QC-approved stock. See `QR-ACTIVATION.md`.
- **Warranties:** search owner/mobile/VIN/plate/serial/code, filter status and flags, inspect registration details, review with rejection reasons, and print verification QR labels.
- **Claims (`/admin#claims`):** warranty claims follow the policy's five stages (received → initial review → technical assessment → decision → remedy and close). Each claim gets a tracking number (`CL-YYMMDD-XXXXX`) and shows its service targets: acknowledge in 2 business days, initial review in 3, decision in 7 after documents are complete (Friday is the weekend; change `ClaimService.Weekend` for other markets). Overdue claims are flagged and counted on the overview. Rules: a final decision needs a determined cause; a rejection needs a documented reason; closing an accepted claim needs the remedy carried out; moving back a stage needs a reason. Labour, parts and other costs are recorded per claim. Claims can be opened from the Claims page or from the warranty dialog, for any registered warranty whatever its status. Staff record claims; there is no public claim form yet.
- **Change log (`/admin#history`):** an append-only `AuditEntries` table records who changed what, when, the old and new values, and the reason. It covers warranty registration, QR activation and review decisions (the previous status and note are kept), claims, roll receipt and QC/status changes, products, coverage settings and users (password resets are logged, never the password). Entries are written in the same transaction as the change. The warranty and claim dialogs show their own history.
- **Customers:** search registration customers by name/mobile/VIN, and view vehicles and warranty histories. No fabricated or independently editable customer records.
- **Settings:** configure film and installation coverage; box labels retain the coverage copied when issued.
- **Account:** change the password using current credentials. No automatic password reset.

The ProductCatalog EF migration creates a new table without deleting or replacing existing records. Apply via normal API startup migrations. Existing live sessions can require signing in again after restarting the local API.

**Faraz HTTPS:** Settings contains a password-type API key field, pattern ID (initially 2675), sender line and OTP variable name (initially code1; use the exact approved template variable). Saving performs read-only account and pattern checks at the official `https://api.iranpayamak.com/ws/v1/` API, then stores the API key using ASP.NET DataProtection in ignored `.local-sms.json`. Neither GET settings nor provider errors return the key. Preserve the server DataProtection key ring when deploying. No test SMS is sent by saving settings. Actual delivery requires a valid new HTTPS key, an approved pattern and sender line; until configured, customer activation remains blocked. Production deployment is separate from local implementation.

Validation: `dotnet test backend/Solarzed.slnx -c Release --no-restore`; frontend `npx next typegen`, `npx tsc --noEmit`, targeted ESLint, and Playwright. Browser tests use `SolarzedBrowserTests`, never the application database. `SOLARZED_TEST_DB_CONNECTION` can override only the browser-test connection for a locally available SQL Server.

## Search, filters and paging

Every admin list is loaded over AJAX with server-side filtering, sorting (click a column header) and paging; typing is debounced and stale responses are discarded.

- **Warranties:** status, free text (code, owner, mobile, VIN, plate, serial, invoice, roll), product type, flagged / not flagged, a specific flag, make/model, installer/seller, installed and registered date ranges, film warranty expiring within 30/90/365 days. CSV export of the filtered set (up to 200 rows, formula-safe).
- **Rolls:** free text, product, type, QC, stock status, batch, supplier, received date range, with/without installations. CSV export.
- **Products:** free text, type, series, active/archived.
- **Customers:** free text (name, mobile, VIN, plate, code), make/model, warranty status, type, installed date range; paged per customer.

The selected section is kept in the URL hash (`/admin#rolls`), so reload and Back work.

## SMS section

`/admin#sms` shows the connection state (Active / Paused / Not connected), sender line, pattern and last verification time.

- **Connection:** API key, pattern, sender line, OTP variable. The key may be left empty to keep the stored encrypted key. "Disconnect" deletes it.
- **Verification rules:** pause/resume sending, code validity (2–15 min), resend wait (30–600 s), daily messages per mobile (1–50). Stored in `.local-sms.json` (section `Sms`) and applied to customer activation immediately.
- **Test message:** sends one real pattern SMS with a random code (5 per 10 minutes).
- **Recent activity:** masked numbers, purpose and result; kept in memory only, never codes.

## Security

- Admin session is an **HttpOnly, SameSite=Strict cookie** (`sz_admin`, path `/api`, 8 h); scripts never see the token. Cookie-authenticated writes require the `X-Requested-With: fetch` header (CSRF defence). Bearer tokens still work for scripts.
- JWT validates issuer, audience, algorithm and lifetime. **Changing the password revokes every existing session.**
- Login: per-IP rate limit (10 / 10 min), per-username lockout (5 failures / 15 min), constant-time response for unknown usernames.
- Global per-IP rate limit (600 / min); SMS test limit; 1 MB request cap; search terms capped at 100 characters; page size capped at 200.
- API headers: strict CSP, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, CORP/COOP, `no-store` on admin and activation responses, HSTS outside Development, no `Server` header.
- Site headers (Next.js): CSP (self + API + Google Fonts), frame blocking, HSTS in production, no `X-Powered-By`; `/admin` is `noindex`, `no-store`; `robots.txt` disallows `/admin`, `/api/`, `/activate`.

**Production settings:**

| Setting | Where | Why |
| --- | --- | --- |
| `Jwt__Key` (32+ random bytes) | API | Without it a random key is generated per start and all admins are signed out on restart. |
| `FrontendOrigin` | API | Exact site origin for CORS with credentials. |
| `ReverseProxy__Enabled=true` | API | When behind nginx/IIS ARR, so rate limits use the real client IP. |
| `SOLARZED_REVALIDATE_SECRET` (16+ chars, same value) | API **and** Next.js | Lets the API refresh cached catalog pages instantly after a product save. |
| `Frontend__RevalidateUrl` | API (optional) | Internal URL of the Next.js server if it differs from `FrontendOrigin`. |

The site and the API must be on the **same site** (e.g. `solarzed.com` and `api.solarzed.com`, or the same host via the `/api` rewrite) for the SameSite=Strict cookie to be sent.

## Caching

- **Catalog pages and header menu:** cached in the Next.js Data Cache (tag `catalog`, 60 s fallback window) instead of calling the API on every page view. A product save evicts the API output cache and calls `/api/internal/revalidate`, so changes appear on the next visit.
- **API:** `/api/catalog` output-cached server-side (evicted on product save) with `Cache-Control: public, max-age=30`; Brotli/gzip compression for all responses.
- **Static files:** `/assets` cached 7 days and `/legacy` 1 day with stale-while-revalidate; hashed Next.js bundles are immutable.
- Admin and activation data are never cached.
