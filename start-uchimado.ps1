param(
    [int]$Port = 8000,
    [switch]$Lan
)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$projectPython = Join-Path $PSScriptRoot '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $projectPython)) { throw 'Run setup-uchimado.ps1 first.' }
if (-not (Test-Path -LiteralPath 'dist\index.html')) { throw 'Run npm run build first.' }
$bindAddress = if ($Lan) { '0.0.0.0' } else { '127.0.0.1' }
Write-Host "uchimado: http://localhost:$Port (Ctrl+C to stop)"
& $projectPython -m uvicorn backend.main:app --host $bindAddress --port $Port --no-access-log
exit $LASTEXITCODE
