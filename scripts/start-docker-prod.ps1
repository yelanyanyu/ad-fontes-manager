param(
  [string]$EnvFile = ".env.production",
  [switch]$NoCache,
  [switch]$SkipDown,
  [switch]$PullBaseImages
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Read-EnvFile {
  param([string]$Path)

  $result = @{}
  $lines = Get-Content -Path $Path -Encoding UTF8

  foreach ($line in $lines) {
    $trimmed = $line.Trim()
    if (-not $trimmed) { continue }
    if ($trimmed.StartsWith("#")) { continue }
    if (-not $trimmed.Contains("=")) { continue }

    $parts = $trimmed.Split("=", 2)
    $key = $parts[0].Trim()
    $value = $parts[1].Trim()

    if (-not $key) { continue }
    $result[$key] = $value
  }

  return $result
}

function Assert-RequiredValue {
  param(
    [hashtable]$EnvMap,
    [string]$Name
  )

  if (-not $EnvMap.ContainsKey($Name)) {
    throw "Missing required key '$Name' in env file."
  }

  $value = [string]$EnvMap[$Name]
  if ([string]::IsNullOrWhiteSpace($value)) {
    throw "Required key '$Name' is empty."
  }
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $scriptDir "..") | Select-Object -ExpandProperty Path
Set-Location $repoRoot

if (-not (Test-Path -LiteralPath "docker-compose.yml")) {
  throw "docker-compose.yml not found in repository root: $repoRoot"
}

$resolvedEnvFile = Resolve-Path -LiteralPath $EnvFile | Select-Object -ExpandProperty Path
$envMap = Read-EnvFile -Path $resolvedEnvFile

Assert-RequiredValue -EnvMap $envMap -Name "ADMIN_TOKEN"
Assert-RequiredValue -EnvMap $envMap -Name "VITE_ADMIN_TOKEN"
Assert-RequiredValue -EnvMap $envMap -Name "DATABASE_URL"
Assert-RequiredValue -EnvMap $envMap -Name "PORT"

$adminToken = [string]$envMap["ADMIN_TOKEN"]
$viteAdminToken = [string]$envMap["VITE_ADMIN_TOKEN"]

if ($adminToken -ne $viteAdminToken) {
  throw "ADMIN_TOKEN and VITE_ADMIN_TOKEN must be identical in '$resolvedEnvFile'."
}

if ($adminToken -match "placeholder|replace-in-production|dev-token-not-for-production") {
  throw "ADMIN_TOKEN looks like a placeholder/dev token. Please set a real production token first."
}

if ($adminToken.Length -lt 32) {
  throw "ADMIN_TOKEN is too short for production. Use at least 32 characters."
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw "Docker CLI is not available in PATH."
}

$composeBase = @("compose", "--env-file", $resolvedEnvFile)

Write-Host "[1/4] Checking docker compose..." -ForegroundColor Cyan
& docker @composeBase version
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

if (-not $SkipDown) {
  Write-Host "[2/4] Stopping existing containers..." -ForegroundColor Cyan
  & docker @composeBase down --remove-orphans
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

if ($PullBaseImages) {
  Write-Host "[3/4] Pulling newer base images and rebuilding app image..." -ForegroundColor Cyan
} else {
  Write-Host "[3/4] Rebuilding app image from the current project state..." -ForegroundColor Cyan
}

$buildArgs = @("build")
if ($PullBaseImages) {
  $buildArgs += "--pull"
}
if ($NoCache) {
  $buildArgs += "--no-cache"
}
$buildArgs += "app"
& docker @composeBase @buildArgs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "[4/4] Starting app container..." -ForegroundColor Cyan
& docker @composeBase up -d --force-recreate app
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ""
Write-Host "Deployment completed." -ForegroundColor Green
Write-Host "Service status:" -ForegroundColor Green
& docker @composeBase ps

Write-Host ""
Write-Host "Built image list:" -ForegroundColor Green
& docker @composeBase images

Write-Host ""
Write-Host "If frontend still returns 403, clear browser local token:" -ForegroundColor Yellow
Write-Host "localStorage.removeItem('ad_fontes_admin_token')"
