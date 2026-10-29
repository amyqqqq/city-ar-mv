param([ValidateSet('original', 'generated')][string]$Mode)
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)
$python = Join-Path (Get-Location) '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $python)) {
    & py -3.11 -m venv .venv
    if ($LASTEXITCODE -ne 0) { throw 'Python 3.11 is required' }
}
if ($Mode) { & $python -m pipeline compose --mode $Mode }
else { & $python -m pipeline compose }
if ($LASTEXITCODE -ne 0) { throw 'Compose failed' }
& $python -m pipeline validate
if ($LASTEXITCODE -ne 0) { throw 'Validation failed' }
