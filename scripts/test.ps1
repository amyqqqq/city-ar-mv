$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)
$python = '.\.venv\Scripts\python.exe'
& $python -m pipeline compose
if ($LASTEXITCODE -ne 0) { throw 'Compose failed' }
& $python -m unittest discover -s tests -p 'test_*.py' -v
if ($LASTEXITCODE -ne 0) { throw 'Python tests failed' }
& node --test tests/js/player.test.mjs tests/js/diagnostics.test.mjs
if ($LASTEXITCODE -ne 0) { throw 'JavaScript tests failed' }
