param(
  [string]$ClientUrl = 'https://balance-sud-uz.vercel.app'
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$backendEnvPath = Join-Path $projectRoot 'backend\.env'
$productionEnvPath = Join-Path $projectRoot 'production.env'

if (-not (Test-Path -LiteralPath $backendEnvPath)) {
  throw 'backend/.env topilmadi.'
}

$backendValues = @{}
foreach ($line in Get-Content -LiteralPath $backendEnvPath) {
  if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$') {
    $backendValues[$Matches[1]] = $Matches[2]
  }
}

$existingProductionValues = @{}
if (Test-Path -LiteralPath $productionEnvPath) {
  foreach ($line in Get-Content -LiteralPath $productionEnvPath) {
    if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$') {
      $existingProductionValues[$Matches[1]] = $Matches[2]
    }
  }
}

foreach ($requiredKey in @('DATABASE_URL', 'JWT_SECRET')) {
  if ([string]::IsNullOrWhiteSpace($backendValues[$requiredKey])) {
    throw "backend/.env ichida $requiredKey sozlanmagan."
  }
}

$databaseUrl = $backendValues['DATABASE_URL']
if ($databaseUrl -match '@localhost(?=[:/])') {
  $databaseUrl = $databaseUrl -replace '@localhost(?=[:/])', '@host.docker.internal'
}

function New-RandomSecret {
  $bytes = New-Object byte[] 64
  $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $generator.GetBytes($bytes)
  } finally {
    $generator.Dispose()
  }
  return [Convert]::ToBase64String($bytes)
}

$jwtSecret = $existingProductionValues['JWT_SECRET']
if ([string]::IsNullOrWhiteSpace($jwtSecret) -or $jwtSecret -eq 'change-me-super-secret') {
  $jwtSecret = $backendValues['JWT_SECRET']
}
if ([string]::IsNullOrWhiteSpace($jwtSecret) -or $jwtSecret -eq 'change-me-super-secret') {
  $jwtSecret = New-RandomSecret
}

$clipboardCommand = (Get-Clipboard -Raw).Trim()
if ($existingProductionValues['CLOUDFLARE_TUNNEL_TOKEN']) {
  $cloudflareToken = $existingProductionValues['CLOUDFLARE_TUNNEL_TOKEN']
} elseif ($clipboardCommand -match '^docker run cloudflare/cloudflared:latest tunnel --no-autoupdate run --token ([A-Za-z0-9._-]+)$') {
  $cloudflareToken = $Matches[1]
} else {
  $connector = docker inspect balance-production-cloudflared 2>$null | ConvertFrom-Json
  if (-not $connector) {
    throw 'Cloudflare tokeni clipboard yoki connector ichida topilmadi.'
  }
  $connectorCommand = @($connector[0].Config.Cmd)
  $tokenIndex = [Array]::IndexOf($connectorCommand, '--token')
  if ($tokenIndex -lt 0 -or $tokenIndex + 1 -ge $connectorCommand.Count) {
    throw 'Connector ichida Cloudflare tokeni topilmadi.'
  }
  $cloudflareToken = $connectorCommand[$tokenIndex + 1]
}

if ($existingProductionValues['ONLYOFFICE_JWT_SECRET']) {
  $onlyOfficeSecret = $existingProductionValues['ONLYOFFICE_JWT_SECRET']
} else {
  $onlyOfficeSecret = New-RandomSecret
}
$jwtExpiresIn = if ($backendValues['JWT_EXPIRES_IN']) { $backendValues['JWT_EXPIRES_IN'] } else { '1d' }

$lines = @(
  'API_DOMAIN=api.ulugbekakmalovich.uz'
  'OFFICE_DOMAIN=office.ulugbekakmalovich.uz'
  ''
  "DATABASE_URL=$databaseUrl"
  "JWT_SECRET=$jwtSecret"
  "JWT_EXPIRES_IN=$jwtExpiresIn"
  ''
  "CLIENT_URL=$ClientUrl"
  'ONLYOFFICE_PUBLIC_URL=https://office.ulugbekakmalovich.uz'
  "ONLYOFFICE_JWT_SECRET=$onlyOfficeSecret"
  "CLOUDFLARE_TUNNEL_TOKEN=$cloudflareToken"
)

[IO.File]::WriteAllLines($productionEnvPath, $lines, [Text.UTF8Encoding]::new($false))
Write-Output 'production.env xavfsiz yaratildi.'
