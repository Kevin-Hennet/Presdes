param(
    [ValidateRange(1024, 65535)]
    [int]$Port = 8080,
    [switch]$Install
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$venv = Join-Path $env:LOCALAPPDATA 'PresDes/.venv'
$python = Join-Path $venv 'Scripts/python.exe'

if (-not (Test-Path -LiteralPath $python)) {
    uv venv --python 3.11 $venv
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
uv --quiet pip install --link-mode copy --python $python -r (Join-Path $repo 'backend/requirements.txt')
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Push-Location (Join-Path $repo 'frontend')
try {
    if ($Install -or -not (Test-Path -LiteralPath 'node_modules/vite/package.json')) {
        npm.cmd ci
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    }
    npm.cmd run build
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally {
    Pop-Location
}

Push-Location (Join-Path $repo 'backend')
try {
    & $python -m uvicorn app.main:app --host 127.0.0.1 --port $Port --no-access-log
    exit $LASTEXITCODE
} finally {
    Pop-Location
}
