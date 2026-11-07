# Backend tests

Run from the repository root:

```powershell
dotnet restore backend/Solarzed.slnx --source https://api.nuget.org/v3/index.json
dotnet test backend/Solarzed.slnx -c Release --no-restore
```

Release avoids colliding with a running Debug API. Tests use isolated EF Core
in-memory databases; they never connect to the application database or send SMS.

The Node suites remain for the legacy server. Their applicable business cases
are ported to `WarrantyTests.cs`: validation, Persian/Arabic phone normalization,
glass/panel selection, VIN validation, duplicate serial/invoice, persistence and
lookup, public identity masking, roll sequences and QC flags, admin login,
coverage settings validation, activation/rejection and coverage dates.

SMS delivery/failure, Node cookie sessions/logout, static-file serving, lookup
rate limiting and Node SQL adapters are legacy-only features and are still
covered by the Node suites. The .NET API does not implement those features;
these tests do not claim parity for them. EF InMemory verifies business logic,
not SQL Server unique indexes or transaction behavior.

The real browser/API/SQL Server smoke test is in `frontend/tests/admin.spec.ts`.
It includes HTTP authentication enforcement and exercises admin forms.
