# Solarzed Development Guide

## Stack

| Layer | Technology |
|-------|------------|
| Backend API | ASP.NET Core 10 Web API |
| Database ORM | EF Core 10 Code First → SQL Server LocalDB |
| Frontend | Next.js 16 + TypeScript + Tailwind CSS 4 |

## Quick Start

### 1. Start SQL Server LocalDB
```
sqllocaldb start MSSQLLocalDB
```

### 2. Run the Backend API (port 5000)
```
cd backend/Solarzed.Api
dotnet run --urls http://localhost:5000
```
On first run it prints the admin password. The DB and tables are created automatically.

### 3. Run the Frontend (port 3000)
```
cd frontend
npm install   # first time only
npm run dev
```

Open http://localhost:3000

## Project Structure

```
backend/
  Solarzed.Api/
    Domain/           EF Core entities (WarrantyRegistration, Roll, CoverageSetting, AdminUser)
    Infrastructure/   AppDbContext
    Application/      WarrantyService, RollService (business logic)
    Controllers/      RegistrationController, WarrantyController, AdminController
    Migrations/       EF Core Code First migrations
    Program.cs        DI, JWT, CORS, auto-migrate

frontend/
  src/
    app/
      page.tsx              Home
      warranty/page.tsx     Customer warranty inquiry
      register/page.tsx     Installer registration
      admin/page.tsx        Admin panel
    lib/api.ts              API client
```

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /api/registrations | — | Submit warranty registration |
| GET | /api/warranty?q= | — | Customer lookup (code/VIN/phone) |
| GET | /api/registrations/:code | — | Get by code |
| POST | /api/admin/login | — | Get JWT token |
| GET | /api/admin/overview | JWT | Dashboard stats |
| GET | /api/admin/warranties | JWT | List with filters |
| POST | /api/admin/warranties/:code/decision | JWT | Approve/reject |
| GET | /api/admin/rolls | JWT | Roll inventory |
| POST | /api/admin/rolls | JWT | Receive new rolls |
| GET/POST | /api/admin/settings | JWT | Coverage durations |

## Legacy (Node.js) server

The original Node.js server is still in the root: `serve.cjs`, `solarzed-server.cjs`, `solarzed-admin.cjs`.  
Run it with: `node serve.cjs`  
Static files: `dist/`

Once the .NET + Next.js rewrite reaches parity the legacy server can be removed.

## Verification

Carton QR issuance, printing and customer SMS activation are documented in
[`QR-ACTIVATION.md`](QR-ACTIVATION.md). Use the current `/admin` route for this
feature; it is not added to the legacy `/admin.html` server.

```powershell
# Repository root
dotnet restore backend/Solarzed.slnx --source https://api.nuget.org/v3/index.json
dotnet test backend/Solarzed.slnx -c Release --no-restore

# frontend/
npm run test:e2e
```

See `backend/Solarzed.Api.Tests/README.md` for the legacy-to-xUnit coverage map,
and `frontend/tests/README.md` for real Chrome/API/LocalDB testing. Browser tests
use ports 3100/5100 and the separate `SolarzedBrowserTests` database. Set
`FrontendOrigin` to the frontend origin when running the API on a custom setup.

Coverage durations are configured in Admin → Settings, with separate film and
installation periods for tint and PPF. No business duration is selected by
default. Changes are applied when activating a warranty, not retroactively.
