# ================================================================
#  deploy-server.ps1  —  Zero-Downtime Deployment (Windows Server)
#  Server: 51.68.57.167
#  Usage:  powershell -ExecutionPolicy Bypass -File deploy-server.ps1
# ================================================================

param(
    [string]$AppDir  = "C:\Apps\sunvision",
    [string]$Branch  = "main",
    [string]$SQLPass = $env:SOLARZED_SQL_PASSWORD
)

$ErrorActionPreference = 'Stop'

function Log-Info  ([string]$m) { Write-Host "[ INFO ] $m" -ForegroundColor Cyan   }
function Log-Ok    ([string]$m) { Write-Host "[  OK  ] $m" -ForegroundColor Green  }
function Log-Warn  ([string]$m) { Write-Host "[ WARN ] $m" -ForegroundColor Yellow }
function Log-Err   ([string]$m) { Write-Host "[ ERR  ] $m" -ForegroundColor Red    }

function Require ([string]$cmd) {
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
        Log-Err "$cmd پیدا نشد. لطفاً نصب کنید."
        exit 1
    }
}

# ── بررسی ابزارها ───────────────────────────────────────────────
Require "git"
Require "node"
Require "npm"
Require "pm2"
Require "dotnet"

Log-Info "=== شروع دیپلوی  $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') ==="
Log-Info "پوشه: $AppDir  |  Branch: $Branch"

Set-Location $AppDir

# ── 1. گرفتن آخرین کد ───────────────────────────────────────────
Log-Info "دریافت آخرین کد از git..."
git fetch --all 2>&1 | Out-Null
$before = git rev-parse HEAD
git reset --hard "origin/$Branch"
$after = git rev-parse HEAD

if ($before -eq $after) {
    Log-Warn "تغییری در کد نبود — ادامه می‌دهیم."
} else {
    Log-Ok "کد آپدیت شد: $($before.Substring(0,7)) -> $($after.Substring(0,7))"
    git log --oneline "$before..$after"
}

# ── 2. بیلد .NET API ────────────────────────────────────────────
Log-Info "بیلد .NET backend..."
$apiPublish = "$AppDir\.publish\api"
Push-Location "$AppDir\backend"
dotnet publish "Solarzed.Api\Solarzed.Api.csproj" `
    -c Release `
    -o $apiPublish `
    --nologo `
    -v q
if ($LASTEXITCODE -ne 0) { Log-Err "بیلد .NET شکست خورد"; exit 1 }
Log-Ok ".NET build موفق -> $apiPublish"
Pop-Location

# ── 3. نصب وابستگی‌های root ─────────────────────────────────────
Log-Info "npm ci (root)..."
Push-Location $AppDir
npm ci --omit=dev --silent
if ($LASTEXITCODE -ne 0) { Log-Err "npm ci شکست خورد"; exit 1 }
Log-Ok "وابستگی‌های root آماده"
Pop-Location

# ── 4. بیلد Next.js ─────────────────────────────────────────────
Log-Info "بیلد Next.js frontend..."
Push-Location "$AppDir\frontend"
npm ci --silent
if ($LASTEXITCODE -ne 0) { Log-Err "npm ci frontend شکست خورد"; exit 1 }
npm run build
if ($LASTEXITCODE -ne 0) { Log-Err "بیلد Next.js شکست خورد"; exit 1 }
Log-Ok "Next.js build موفق"
Pop-Location

# ── 5. رمز SQL ──────────────────────────────────────────────────
if (-not $SQLPass) {
    $secPass = Read-Host "رمز SQL Server" -AsSecureString
    $SQLPass = [System.Net.NetworkCredential]::new('', $secPass).Password
}

$env:SOLARZED_STORAGE      = 'mssql'
$env:SOLARZED_SQL_SERVER   = '127.0.0.1'
$env:SOLARZED_SQL_DATABASE = 'SolarzedWarranty'
$env:SOLARZED_SQL_USER     = 'sa'
$env:SOLARZED_SQL_PASSWORD = $SQLPass
$env:PORT                  = '4173'

# ── 6. Zero-Downtime با PM2 ─────────────────────────────────────
#   pm2 reload = instance جدید اول می‌آید، بعد قدیمی می‌رود
#   هیچ request‌ای drop نمی‌شود

$pm2Json = (pm2 jlist 2>$null) | ConvertFrom-Json -ErrorAction SilentlyContinue
function PM2-Running ([string]$name) {
    return ($pm2Json | Where-Object { $_.name -eq $name }) -ne $null
}

# Node.js web server
Log-Info "PM2: solarzed-web..."
if (PM2-Running "solarzed-web") {
    pm2 reload solarzed-web --update-env
    Log-Ok "solarzed-web reload (zero-downtime)"
} else {
    pm2 start "$AppDir\serve.cjs" `
        --name "solarzed-web" `
        --max-memory-restart 512M `
        --time
    Log-Ok "solarzed-web started"
}

# .NET API
Log-Info "PM2: solarzed-api..."
if (PM2-Running "solarzed-api") {
    pm2 reload solarzed-api --update-env
    Log-Ok "solarzed-api reload (zero-downtime)"
} else {
    pm2 start "$apiPublish\Solarzed.Api.exe" `
        --name "solarzed-api" `
        --max-memory-restart 512M `
        --time
    Log-Ok "solarzed-api started"
}

# Next.js
Log-Info "PM2: solarzed-next..."
if (PM2-Running "solarzed-next") {
    pm2 reload solarzed-next --update-env
    Log-Ok "solarzed-next reload (zero-downtime)"
} else {
    pm2 start npm `
        --name "solarzed-next" `
        --cwd "$AppDir\frontend" `
        -- run start `
        --max-memory-restart 512M `
        --time
    Log-Ok "solarzed-next started"
}

# ── 7. ذخیره + گزارش ────────────────────────────────────────────
pm2 save
Log-Ok "وضعیت PM2 ذخیره شد"

Write-Host ""
Write-Host "════════════════════════════════════════" -ForegroundColor Green
Write-Host "  دیپلوی موفق!  $(Get-Date -Format 'HH:mm:ss')" -ForegroundColor Green
Write-Host "════════════════════════════════════════" -ForegroundColor Green
pm2 list

Remove-Item Env:SOLARZED_SQL_PASSWORD -ErrorAction SilentlyContinue
