$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$config = Join-Path $repo 'backend/.env'

git -C $repo check-ignore -q -- backend/.env
if ($LASTEXITCODE -ne 0) { throw 'Expected backend/.env to be ignored by Git.' }
if ((Get-Item -LiteralPath $config -ErrorAction SilentlyContinue).LinkType) {
    throw 'Use a regular backend/.env file.'
}

$mongoUri = Read-Host 'MongoDB connection URI' -MaskInput
if ($mongoUri -notmatch '^mongodb(?:\+srv)?://[^\s#''"]+$') {
    throw 'Enter a MongoDB connection URI with special characters URL-encoded.'
}

$lines = if (Test-Path -LiteralPath $config) {
    [IO.File]::ReadAllLines($config)
} else {
    [IO.File]::ReadAllLines("$config.example")
}
$sessionPattern = '^\s*(?:export\s+)?MONGODB_SESSION_SECRET\s*=\s*(?:''[^'']{32,}''|"[^"]{32,}"|[^\s''"#]{32,})(?:\s+#.*)?\s*$'
$sessionSecrets = @($lines | Where-Object { $_ -match $sessionPattern })
$updated = @($lines | Where-Object {
    $_ -notmatch '^\s*(?:export\s+)?(?:MONGODB_URI|MONGODB_SESSION_SECRET)\s*='
})
if ($sessionSecrets.Count -gt 0) {
    $updated += $sessionSecrets[-1]
} else {
    $randomBytes = [Security.Cryptography.RandomNumberGenerator]::GetBytes(32)
    $updated += 'MONGODB_SESSION_SECRET=' + [Convert]::ToHexString($randomBytes).ToLowerInvariant()
}
$updated += "MONGODB_URI='$mongoUri'"
[IO.File]::WriteAllLines($config, [string[]]$updated, [Text.UTF8Encoding]::new($false))
Write-Host 'MongoDB connection saved to backend/.env. Restart PresDes to use it.'
