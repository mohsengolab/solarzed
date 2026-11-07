# Carton QR warranty activation

This feature is implemented in the current ASP.NET Core + Next.js application
(`/admin` and `/activate`). The legacy Node server (`/admin.html`, port 4173) is
unchanged and does not serve these new activation routes. The original homepage
design and the existing installer-registration review process are preserved.

## Manager workflow

Admin sign-in requires both username and password. The seeded username is `admin`;
the existing admin password is preserved. Local API port 5010 is used in this
workspace because port 5000 belongs to another service.

1. Set approved film/installation periods in Admin → Settings.
2. Receive a roll in Rolls with approved QC. It can still be in stock when labels
   are prepared; printing does not mark inventory as shipped.
3. In Labels, generate 1–200 unique labels for that roll, one per carton/product unit.
4. Select labels and print. The default format is 80 × 50 mm, configurable from
   60–150 mm wide and 40–150 mm high. Select matching paper in the printer driver,
   100% scale, and disable browser headers/footers. There is one label per page.
5. When distributing the boxes, use **Mark roll as shipped — enable customer
   activation**. The existing printed codes become eligible without reprinting.
   Until then, the customer page explains that activation is awaiting release.

The QR contains only `https://solarzed.com/activate#<random-token>`. QR generation
is local; no customer data goes to an external QR service. Codes have a four-module
quiet zone and black modules on white. Readability is verified by decoding the
actual rendered QR in the browser test. The local activation-preview link is for
development; printed labels always contain the configured public domain.

Every label has its own `SZB-…` product serial, linked internally to its parent
roll. The new warranty uses that unit serial in `FilmSerial` and the inventory
roll in `RollId`. This permits multiple boxes from one roll/invoice while keeping
the existing unique serial/invoice constraint. Reprinting retains the same token.
Changing the public domain is blocked once labels exist, to avoid silently
invalidating printed stock. Keep the domain and `/activate` route reachable.

## Customer workflow

Scanning opens the existing-information form: name, mobile, vehicle make/model,
VIN, plate, installation date, invoice, installer/seller and covered areas.
Product type and serial are always bound on the server to the issued carton.
The user requests a six-digit code, receives it on their mobile, then submits it
to activate the warranty. The successful page shows the warranty number and end
dates. Coverage uses the periods captured when the label was issued and starts
at the entered installation date, matching the existing coverage rules.

Codes expire after five minutes. Wrong codes are limited to five attempts;
resends require 60 seconds and daily phone/box limits also apply. An OTP is bound
to one mobile and one label. Missing provider configuration or failed/rejected
SMS submission never permits activation. There is no development OTP bypass.
The provider accepting a message does not itself prove delivery; only entering
the correct code completes mobile verification.

The label, consumed OTP and active warranty are committed in one EF database
transaction with optimistic concurrency. A second activation loses the race and
cannot create another warranty. Public rescan metadata contains no owner/mobile
or private seller information. Existing non-QR registrations still need review.

## Faraz configuration

The SOAP `SendSMSByPattern` envelope/acceptance contract follows
`F:/Software/dande/apps/api/src/modules/sms/faraz-pattern.ts`. The pattern must
have the variable `code`. The dande project is read only for this import.

Server configuration keys are `Faraz:Endpoint`, `Faraz:Sender`, `Faraz:OtpPattern`
and `Faraz:Token`. Use the environment form `Faraz__Endpoint`, etc., in deployment.
The endpoint must use valid HTTPS. No certificate-validation bypass is present.
The existing HTTPS SMS webhook adapter is also supported through
`ActivationSms:Webhook`/`ActivationSms:Token` or `SOLARZED_SMS_WEBHOOK`/`SOLARZED_SMS_TOKEN`.

The optional local importer reads only the saved SMS record, decrypts it using
the source configuration, and writes an ignored server-only settings file:

```powershell
node backend/import-dande-faraz.cjs F:/Software/dande
# If the saved source uses an obsolete HTTP IP, supply the confirmed HTTPS SOAP URL:
node backend/import-dande-faraz.cjs F:/Software/dande https://PROVIDER/CONFIRMED-SOAP-PATH
```

The destination `backend/Solarzed.Api/.local-sms.json` is excluded from Git, is
never served by Next.js, and is not printed in tool output. The importer sends no
SMS and does not modify dande. At implementation time, all three credential/
pattern fields existed, but the saved endpoint was HTTP at `185.112.33.61` and
its HTTPS equivalent could not be verified. Import therefore remained disabled
pending the correct provider endpoint. No real SMS delivery has been tested.

A read-only check of the official HTTPS REST account endpoint also returned 401
for the source key. It did not send SMS or display the account balance. The
legacy SOAP key must not be assumed compatible with the newer REST API.
To repeat only that diagnostic: `node backend/import-dande-faraz.cjs F:/Software/dande --probe-rest`.

Back up the ASP.NET Data Protection key ring alongside the database. It is
needed for reprinting encrypted QR secrets. The database stores only token
hashes for lookup and encrypted tokens for reprint; it never stores raw OTPs.

## Deployment and verification

Apply the included `BoxLabelsAndActivation` EF migration (startup applies pending
migrations in the current app). Configure production API routing and deploy the
Next.js `/activate` page to **solarzed.com** before attaching labels to products.
Use same-origin API routing (leave `NEXT_PUBLIC_API_URL` unset), or a public API
origin; never ship a production frontend that points customers at localhost.

```powershell
dotnet restore backend/Solarzed.slnx --source https://api.nuget.org/v3/index.json
dotnet test backend/Solarzed.slnx -c Release --no-restore
# frontend/
npm run test:e2e -- --grep "real QR generation"
```

Backend tests cover real SQLite transactions, code expiry/attempts, mobile
binding, failed SMS, protected labels, replay, concurrent activation and Faraz
response parsing. The browser test uses the real API/SQL Server for label issue,
QR decoding and print layout; SMS responses are explicitly simulated for the
customer form. Tests send no SMS and use the isolated `SolarzedBrowserTests`
database. This implementation does not publish changes to solarzed.com.
