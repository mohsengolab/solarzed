# Admin browser smoke test

Prerequisites: .NET 10, Node.js, SQL Server LocalDB (`MSSQLLocalDB`), Google
Chrome, and restored backend/frontend dependencies.

```powershell
# From frontend/
npm install
npm run test:e2e
```

Playwright starts the real API on port 5100 and Next.js on port 3100, and stops
them when finished. It uses a separate `SolarzedBrowserTests` LocalDB database
with test-only credentials, never `SolarzedWarranty`. Test records and coverage
settings are persisted in that test database so repeated runs remain inspectable.
Keep ports 3100 and 5100 free. The existing servers on 3000/5000 are not reused.

The test checks incorrect/correct admin login, unauthenticated API rejection,
all four coverage settings and persistence after navigation, roll creation,
warranty activation with calculated dates, rejection requiring a note, and sign
out. Browser errors fail the test. A settings screenshot is saved under
`test-results/`; failures retain screenshots. Set `PLAYWRIGHT_TRACE=1` to retain
traces on failure (disabled by default to reduce I/O on slow drives).

Chrome is used by default. Set `PLAYWRIGHT_CHANNEL=msedge` to use installed
Microsoft Edge. No browser binary download is required for these channels.

Coverage periods apply when a decision activates a warranty. Changing Settings
does not recalculate previously approved records. Clearing a period sets its
end date to null on the next activation. Allowed film periods are 3/5/7/10 years;
installation periods are 1/2/3 years. Real business durations must be selected
by the administrator in Settings; the test only selects values in its test DB.
