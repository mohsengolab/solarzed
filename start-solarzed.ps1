$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$env:SOLARZED_STORAGE = 'mssql'
$env:SOLARZED_SQL_SERVER = '127.0.0.1'
$env:SOLARZED_SQL_DATABASE = 'SolarzedWarranty'
$env:SOLARZED_SQL_USER = 'sa'
$solarzedSecurePassword = Read-Host 'SQL Server password' -AsSecureString
$solarzedCredential = [System.Net.NetworkCredential]::new('', $solarzedSecurePassword)
$env:SOLARZED_SQL_PASSWORD = $solarzedCredential.Password
try {
    & node (Join-Path $PSScriptRoot 'serve.cjs')
} finally {
    Remove-Item Env:SOLARZED_SQL_PASSWORD -ErrorAction SilentlyContinue
}
