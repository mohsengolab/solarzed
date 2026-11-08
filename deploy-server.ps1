# ================================================================
#  deploy-server.ps1  -  Zero-Downtime Deployment (Windows Server)
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
        Log-Err "$cmd not found. Please install it first."
        exit 1
    }
}

Require "git"
Require "node"
Require "npm"
Require "pm2"
Require "dotnet"

Log-Info "=== Deploy started: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') ==="
Log-Info "Dir: $AppDir  |  Branch: $Branch"

Set-Location $AppDir

# -- 1. Git pull --
Log-Info "Pulling latest code..."
git fetch --all 2>&1 | Out-Null
$before = git rev-parse HEAD
git reset --hard "origin/$Branch"
$after = git rev-parse HEAD

if ($before -eq $after) {
    Log-Warn "No code changes - continuing anyway."
} else {
    Log-Ok "Code updated: $($before.Substring(0,7)) -> $($after.Substring(0,7))"
    git log --oneline "$before..$after"
}

# -- 2. Stop API process so the exe is not locked during publish --
Log-Info "Stopping solarzed-api before build (releases exe lock)..."
pm2 stop solarzed-api 2>&1 | Out-Null
Log-Ok "solarzed-api stopped"

# -- 2. Build .NET API --
Log-Info "Building .NET backend..."
$apiPublish = "$AppDir\.publish\api"
Push-Location "$AppDir\backend"
dotnet publish "Solarzed.Api\Solarzed.Api.csproj" `
    -c Release `
    -o $apiPublish `
    --nologo `
    -v q
if ($LASTEXITCODE -ne 0) { Log-Err ".NET build failed"; exit 1 }
Log-Ok ".NET build OK -> $apiPublish"
Pop-Location

# -- 3. Build Next.js --
Log-Info "Building Next.js frontend..."
Push-Location "$AppDir\frontend"
npm install --silent
if ($LASTEXITCODE -ne 0) { Log-Err "npm install (frontend) failed"; exit 1 }
npm run build
if ($LASTEXITCODE -ne 0) { Log-Err "Next.js build failed"; exit 1 }
Log-Ok "Next.js build OK"
Pop-Location

# -- 5. SQL password + set at Machine level so PM2 daemon inherits them --
if (-not $SQLPass) {
    $secPass = Read-Host "SQL Server password" -AsSecureString
    $SQLPass = [System.Net.NetworkCredential]::new('', $secPass).Password
}

$envVars = @{
    SOLARZED_STORAGE      = 'mssql'
    SOLARZED_SQL_SERVER   = '127.0.0.1'
    SOLARZED_SQL_DATABASE = 'SolarzedWarranty'
    SOLARZED_SQL_USER     = 'sa'
    SOLARZED_SQL_PASSWORD = $SQLPass
    PORT                  = '4173'   # solarzed-web only; Next.js uses --port 3000 explicitly
}
foreach ($kv in $envVars.GetEnumerator()) {
    [System.Environment]::SetEnvironmentVariable($kv.Key, $kv.Value, 'Machine')
    Set-Item "Env:$($kv.Key)" $kv.Value
}
Log-Ok "Environment variables saved at Machine scope"

# -- 6. Write ecosystem.config.js (Windows-safe Next.js via node directly) --
$apiExe   = $apiPublish.Replace('\', '\\')
$appDirJs = $AppDir.Replace('\', '\\')
$ecosystem = @"
module.exports = {
  apps: [
    {
      name: 'solarzed-web',
      script: '${appDirJs}\\serve.cjs',
      max_memory_restart: '512M',
      time: true,
    },
    {
      name: 'solarzed-api',
      script: '${apiExe}\\Solarzed.Api.exe',
      interpreter: 'none',
      max_memory_restart: '512M',
      time: true,
    },
    {
      name: 'solarzed-next',
      script: 'node_modules/next/dist/bin/next',
      args: 'start --port 3000',
      cwd: '${appDirJs}\\frontend',
      interpreter: 'node',
      env: { PORT: '3000' },
      max_memory_restart: '512M',
      time: true,
    },
  ],
};
"@
$ecosystemPath = "$AppDir\ecosystem.config.js"
[System.IO.File]::WriteAllText($ecosystemPath, $ecosystem, [System.Text.Encoding]::UTF8)
Log-Ok "ecosystem.config.js written"

# -- 7. PM2 zero-downtime reload --
# startOrReload: starts processes that are new, reloads ones already running.
# Avoids ConvertFrom-Json failure on PM2's JSON with duplicate keys (username/USERNAME).
Log-Info "Starting/reloading all services (zero-downtime)..."
pm2 startOrReload $ecosystemPath --update-env
if ($LASTEXITCODE -ne 0) {
    Log-Warn "startOrReload failed -- falling back to pm2 start"
    pm2 start $ecosystemPath --update-env
}
Log-Ok "All services running"

# -- 7. Save & report --
pm2 save
Log-Ok "PM2 state saved (auto-start on reboot)"

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Deploy successful! $(Get-Date -Format 'HH:mm:ss')" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
pm2 list

Remove-Item Env:SOLARZED_SQL_PASSWORD -ErrorAction SilentlyContinue
