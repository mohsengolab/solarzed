# ================================================================
#  setup-ssl.ps1  -  IIS Reverse Proxy + Let's Encrypt SSL
#  Site:   solarzed.com + www.solarzed.com
#  Server: 51.68.57.167
#
#  Run once on the server (as Administrator):
#    powershell -ExecutionPolicy Bypass -File setup-ssl.ps1
#
#  What this script does:
#    1. Installs IIS with ARR + URL Rewrite modules
#    2. Creates IIS site for solarzed.com (ports 80 & 443)
#    3. Configures reverse proxy to Next.js (port 3000)
#    4. Downloads win-acme and gets free Let's Encrypt certificate
#    5. Sets up automatic renewal via Windows Task Scheduler
# ================================================================

#Requires -RunAsAdministrator
$ErrorActionPreference = 'Stop'

# ── Config ──────────────────────────────────────────────────────
$Domain      = "solarzed.com"
$DomainWww   = "www.solarzed.com"
$NextPort    = 3000          # Next.js listens here (after deploy-server.ps1 fix)
$SiteName    = "solarzed"
$SiteRoot    = "C:\inetpub\solarzed"
$WacmDir     = "C:\tools\win-acme"
$Email       = "golab.mohsen@gmail.com"
# ────────────────────────────────────────────────────────────────

function Log-Info  ([string]$m) { Write-Host "[ INFO ] $m" -ForegroundColor Cyan   }
function Log-Ok    ([string]$m) { Write-Host "[  OK  ] $m" -ForegroundColor Green  }
function Log-Warn  ([string]$m) { Write-Host "[ WARN ] $m" -ForegroundColor Yellow }
function Log-Err   ([string]$m) { Write-Host "[ ERR  ] $m" -ForegroundColor Red; exit 1 }

# ── Step 1: Install IIS + required features ─────────────────────
Log-Info "Installing IIS features..."

$features = @(
    'Web-Server',
    'Web-Common-Http',
    'Web-Default-Doc',
    'Web-Http-Errors',
    'Web-Static-Content',
    'Web-Http-Redirect',
    'Web-Health',
    'Web-Http-Logging',
    'Web-Request-Monitor',
    'Web-Http-Tracing',
    'Web-Performance',
    'Web-Stat-Compression',
    'Web-Dyn-Compression',
    'Web-Security',
    'Web-Filtering',
    'Web-Mgmt-Tools',
    'Web-Mgmt-Console'
)

foreach ($f in $features) {
    $state = (Get-WindowsFeature $f).InstallState
    if ($state -ne 'Installed') {
        Install-WindowsFeature $f | Out-Null
        Log-Ok "Installed: $f"
    }
}
Log-Ok "IIS features ready"

# ── Step 2: Install ARR (Application Request Routing) ───────────
Log-Info "Checking ARR module..."

$arr = Get-WebGlobalModule -Name "ApplicationRequestRouting" -ErrorAction SilentlyContinue
if (-not $arr) {
    Log-Info "Downloading ARR 3.0..."
    $arrMsi = "$env:TEMP\ARR.msi"
    $arrUrl = "https://download.microsoft.com/download/E/9/8/E9849D6A-020E-47E4-9FD0-A023E99B54EB/requestRouter_amd64.msi"
    Invoke-WebRequest -Uri $arrUrl -OutFile $arrMsi -UseBasicParsing
    Start-Process msiexec.exe -ArgumentList "/i `"$arrMsi`" /quiet /norestart" -Wait
    Log-Ok "ARR installed"
} else {
    Log-Ok "ARR already installed"
}

# ── Step 3: Install URL Rewrite module ──────────────────────────
Log-Info "Checking URL Rewrite module..."

$rewrite = Get-WebGlobalModule -Name "RewriteModule" -ErrorAction SilentlyContinue
if (-not $rewrite) {
    Log-Info "Downloading URL Rewrite 2.1..."
    $rwMsi = "$env:TEMP\rewrite.msi"
    $rwUrl = "https://download.microsoft.com/download/1/2/8/128E2E22-C1B9-44A4-BE2A-5859ED1D4592/rewrite_amd64_en-US.msi"
    Invoke-WebRequest -Uri $rwUrl -OutFile $rwMsi -UseBasicParsing
    Start-Process msiexec.exe -ArgumentList "/i `"$rwMsi`" /quiet /norestart" -Wait
    Log-Ok "URL Rewrite installed"
} else {
    Log-Ok "URL Rewrite already installed"
}

# ── Step 4: Enable ARR proxy at server level ────────────────────
Log-Info "Enabling ARR reverse proxy..."
Add-WebConfigurationProperty `
    -PSPath 'MACHINE/WEBROOT/APPHOST' `
    -Filter "system.webServer/proxy" `
    -Name "enabled" -Value "True" -ErrorAction SilentlyContinue

Set-WebConfigurationProperty `
    -PSPath 'MACHINE/WEBROOT/APPHOST' `
    -Filter "system.webServer/proxy" `
    -Name "enabled" -Value "True"

Log-Ok "ARR proxy enabled"

# ── Step 5: Create site root directory ──────────────────────────
if (-not (Test-Path $SiteRoot)) {
    New-Item -ItemType Directory -Path $SiteRoot -Force | Out-Null
}

# ── Step 6: Write web.config (reverse proxy rules) ──────────────
Log-Info "Writing IIS reverse proxy config..."

$webConfig = @"
<?xml version="1.0" encoding="UTF-8"?>
<configuration>
  <system.webServer>
    <rewrite>
      <rules>
        <!-- HTTP → HTTPS redirect -->
        <rule name="HTTP to HTTPS" stopProcessing="true">
          <match url="(.*)" />
          <conditions>
            <add input="{HTTPS}" pattern="^OFF$" />
          </conditions>
          <action type="Redirect" url="https://{HTTP_HOST}/{R:1}"
                  redirectType="Permanent" />
        </rule>
        <!-- Proxy everything to Next.js -->
        <rule name="ReverseProxyToNextJS" stopProcessing="true">
          <match url="(.*)" />
          <action type="Rewrite" url="http://127.0.0.1:$NextPort/{R:1}" />
        </rule>
      </rules>
    </rewrite>
    <!-- Pass real client IP to Next.js -->
    <httpProtocol>
      <customHeaders>
        <remove name="X-Powered-By" />
      </customHeaders>
    </httpProtocol>
    <!-- Preserve host header -->
    <proxy preserveHostHeader="true" />
  </system.webServer>
</configuration>
"@

[System.IO.File]::WriteAllText("$SiteRoot\web.config", $webConfig, [System.Text.Encoding]::UTF8)
Log-Ok "web.config written"

# ── Step 7: Create IIS website ───────────────────────────────────
Import-Module WebAdministration

$existingSite = Get-Website -Name $SiteName -ErrorAction SilentlyContinue
if ($existingSite) {
    Log-Warn "IIS site '$SiteName' already exists -- skipping creation"
} else {
    Log-Info "Creating IIS site '$SiteName'..."
    New-Website -Name $SiteName `
                -PhysicalPath $SiteRoot `
                -Port 80 `
                -HostHeader $Domain `
                -Force | Out-Null

    # Add www binding (port 80)
    New-WebBinding -Name $SiteName -Protocol http -Port 80 -HostHeader $DomainWww

    Log-Ok "IIS site created"
}

# Ensure site is running
Start-Website -Name $SiteName -ErrorAction SilentlyContinue
Log-Ok "IIS site '$SiteName' is running"

# ── Step 8: Download win-acme ────────────────────────────────────
Log-Info "Setting up win-acme (Let's Encrypt)..."

if (-not (Test-Path $WacmDir)) {
    New-Item -ItemType Directory -Path $WacmDir -Force | Out-Null
}

$wacmExe = "$WacmDir\wacs.exe"
if (-not (Test-Path $wacmExe)) {
    Log-Info "Downloading win-acme..."
    $wacmZip = "$env:TEMP\win-acme.zip"
    # win-acme v2.2.9.1701
    $wacmUrl = "https://github.com/win-acme/win-acme/releases/download/v2.2.9.1701/win-acme.v2.2.9.1701.x64.pluggable.zip"
    Invoke-WebRequest -Uri $wacmUrl -OutFile $wacmZip -UseBasicParsing
    Expand-Archive -Path $wacmZip -DestinationPath $WacmDir -Force
    Remove-Item $wacmZip
    Log-Ok "win-acme downloaded to $WacmDir"
} else {
    Log-Ok "win-acme already present"
}

# ── Step 9: Get Let's Encrypt certificate ───────────────────────
Log-Info "Requesting SSL certificate for $Domain and $DomainWww..."
Log-Warn "Make sure DNS for $Domain and $DomainWww point to 51.68.57.167 before continuing!"
Write-Host ""
Write-Host "  Press Enter to continue (or Ctrl+C to abort)..." -ForegroundColor Yellow
Read-Host | Out-Null

# Get the IIS site ID
$siteId = (Get-Website -Name $SiteName).id

# Run win-acme in unattended mode
# Uses IIS HTTP challenge + IIS certificate installation
& $wacmExe `
    --source manual `
    --host "$Domain,$DomainWww" `
    --validation selfhosting `
    --validationport 80 `
    --installation iis `
    --installationsiteid $siteId `
    --emailaddress $Email `
    --accepttos `
    --verbose

if ($LASTEXITCODE -ne 0) {
    Log-Err "win-acme failed -- check DNS is pointing to this server and port 80 is open"
}

Log-Ok "SSL certificate installed!"

# ── Step 10: Add HTTPS binding (IIS) ────────────────────────────
# win-acme handles this automatically, but verify:
$httpsBinding = Get-WebBinding -Name $SiteName -Protocol https -ErrorAction SilentlyContinue
if ($httpsBinding) {
    Log-Ok "HTTPS binding confirmed on IIS site '$SiteName'"
} else {
    Log-Warn "HTTPS binding not found -- win-acme may have used a different site. Check IIS Manager."
}

# ── Step 11: Stop Default Web Site (frees port 80/443) ──────────
$defaultSite = Get-Website -Name "Default Web Site" -ErrorAction SilentlyContinue
if ($defaultSite -and $defaultSite.State -eq "Started") {
    Stop-Website -Name "Default Web Site"
    Set-WebConfiguration -PSPath "IIS:\" `
        -Filter "system.applicationHost/sites/site[@name='Default Web Site']/serverAutoStart" `
        -Value $false -ErrorAction SilentlyContinue
    Log-Ok "Default Web Site stopped"
}

# ── Done ─────────────────────────────────────────────────────────
Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  SSL Setup Complete!  $(Get-Date -Format 'HH:mm:ss')" -ForegroundColor Green
Write-Host "  https://$Domain" -ForegroundColor Green
Write-Host "  Certificate auto-renews every 60 days" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "Next step: run  deploy-server.ps1  to restart PM2 with" -ForegroundColor Cyan
Write-Host "the fixed Next.js port (3000)." -ForegroundColor Cyan
