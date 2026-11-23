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
$before = git rev-parse HEAD
$ea = $ErrorActionPreference; $ErrorActionPreference = 'SilentlyContinue'
git fetch --all
$ErrorActionPreference = $ea
git reset --hard "origin/$Branch"
$after = git rev-parse HEAD

if ($before -eq $after) {
    Log-Warn "No code changes - continuing anyway."
} else {
    Log-Ok "Code updated: $($before.Substring(0,7)) -> $($after.Substring(0,7))"
    git log --oneline "$before..$after"
}

# Nothing that is serving the live site is touched until both builds have succeeded.
# A failed build exits here and leaves the running site as it was.

# -- 2. Build .NET API into a staging folder --
Log-Info "Building .NET backend..."
$apiPublish = "$AppDir\.publish\api"
$apiStaging = "$AppDir\.publish\api-new"
if (Test-Path $apiStaging) { Remove-Item $apiStaging -Recurse -Force }
Push-Location "$AppDir\backend"
dotnet publish "Solarzed.Api\Solarzed.Api.csproj" `
    -c Release `
    -o $apiStaging `
    --nologo `
    -v q
if ($LASTEXITCODE -ne 0) { Log-Err ".NET build failed - live site untouched"; exit 1 }
Log-Ok ".NET build OK -> $apiStaging"
Pop-Location

# -- 3. Build Next.js into the slot that is not live (.next-a / .next-b) --
$slotFile = "$AppDir\frontend\.next-slot"
$liveSlot = if (Test-Path $slotFile) { (Get-Content $slotFile -Raw).Trim() } else { '' }
$nextSlot = if ($liveSlot -eq '.next-a') { '.next-b' } else { '.next-a' }
Log-Info "Building Next.js frontend into $nextSlot (live: $(if ($liveSlot) { $liveSlot } else { '.next' }))..."
Push-Location "$AppDir\frontend"
# Rewrites in next.config.ts are baked into routes-manifest.json at build time.
$env:BACKEND_URL = 'http://127.0.0.1:5010'
[System.IO.File]::WriteAllText("$AppDir\frontend\.env.local", "BACKEND_URL=http://127.0.0.1:5010", [System.Text.Encoding]::UTF8)
if (Test-Path "$AppDir\frontend\$nextSlot") { Remove-Item "$AppDir\frontend\$nextSlot" -Recurse -Force }
npm install --silent
if ($LASTEXITCODE -ne 0) { Log-Err "npm install (frontend) failed - live site untouched"; exit 1 }
$env:NEXT_DIST_DIR = $nextSlot
$env:CI = 'true'   # no interactive prompts during the build
npm run build
$buildExit = $LASTEXITCODE
Remove-Item Env:NEXT_DIST_DIR, Env:CI -ErrorAction SilentlyContinue
if ($buildExit -ne 0) { Log-Err "Next.js build failed - live site untouched"; exit 1 }
Log-Ok "Next.js build OK"
Pop-Location

# -- 5. SQL password + set at Machine level so PM2 daemon inherits them --
if (-not $SQLPass) {
    $secPass = Read-Host "SQL Server password" -AsSecureString
    $SQLPass = [System.Net.NetworkCredential]::new('', $secPass).Password
}

$sqlConnStr = "Server=127.0.0.1;Database=SolarzedWarranty;User Id=sa;Password=$SQLPass;TrustServerCertificate=True;"
$envVars = @{
    SOLARZED_STORAGE                = 'mssql'
    SOLARZED_SQL_SERVER             = '127.0.0.1'
    SOLARZED_SQL_DATABASE           = 'SolarzedWarranty'
    SOLARZED_SQL_USER               = 'sa'
    SOLARZED_SQL_PASSWORD           = $SQLPass
    'ConnectionStrings__Default'    = $sqlConnStr   # .NET backend reads this
    ASPNETCORE_URLS                 = 'http://127.0.0.1:5010'  # port IIS ARR proxies to
    BACKEND_URL                     = 'http://127.0.0.1:5010'  # Next.js → .NET API (server-side)
    PORT                            = '4173'   # solarzed-web only; Next.js uses --port 3000 explicitly
    SOLARZED_KEYS_DIR               = "$AppDir\.keys"          # DataProtection keys; outside .publish so deploys keep them
}
# Login tokens: one key kept across restarts. Generated once, then reused from the machine environment.
$jwtKey = [System.Environment]::GetEnvironmentVariable('Jwt__Key', 'Machine')
if (-not $jwtKey) {
    $bytes = New-Object byte[] 32
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $jwtKey = -join ($bytes | ForEach-Object { $_.ToString('x2') })
    Log-Info "Generated a persistent login key (Jwt__Key)"
}
$envVars['Jwt__Key'] = $jwtKey
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
      env: { PORT: '3000', BACKEND_URL: 'http://127.0.0.1:5010', NEXT_DIST_DIR: '${nextSlot}' },
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
# -- 7a. Swap in the new API build (a few seconds of API downtime) --
Log-Info "Swapping in the new API build..."
$ea = $ErrorActionPreference; $ErrorActionPreference = 'SilentlyContinue'
pm2 stop solarzed-api 2>$null
$ErrorActionPreference = $ea
Start-Sleep -Seconds 2   # let Windows release the exe lock
if (Test-Path $apiPublish) { Remove-Item $apiPublish -Recurse -Force }
Move-Item $apiStaging $apiPublish
[System.IO.File]::WriteAllText($slotFile, $nextSlot, [System.Text.Encoding]::UTF8)
Log-Ok "API swapped; Next.js will serve $nextSlot"

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
