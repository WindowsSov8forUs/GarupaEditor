param(
  [switch]$SkipChecks,
  [int]$SmokeTestSeconds = 0,
  [bool]$FreeDevPort = $true,
  [int]$DevPort = 1420
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Path $PSScriptRoot -Parent
Set-Location $projectRoot

function Invoke-Step {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name,
    [Parameter(Mandatory = $true)]
    [scriptblock]$Action
  )

  Write-Host ""
  Write-Host "=== $Name ===" -ForegroundColor Cyan
  & $Action
  if ($LASTEXITCODE -ne 0) {
    throw "$Name failed with exit code $LASTEXITCODE"
  }
}

function Clear-DevPort {
  param(
    [int]$Port
  )

  $connections = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
  if (-not $connections) {
    return
  }

  $pids = $connections | Select-Object -ExpandProperty OwningProcess -Unique
  foreach ($ownerPid in $pids) {
    try {
      $process = Get-Process -Id $ownerPid -ErrorAction Stop
      Write-Host "Port $Port is in use by PID $ownerPid ($($process.ProcessName)); stopping..." -ForegroundColor Yellow
      Stop-Process -Id $ownerPid -Force
    } catch {
      Write-Host "Failed to stop PID $ownerPid for port ${Port}: $($_.Exception.Message)" -ForegroundColor Yellow
    }
  }
}

Write-Host "Project root: $projectRoot" -ForegroundColor DarkCyan

if (-not $SkipChecks) {
  Invoke-Step "Frontend build check" { npm run build }
  Invoke-Step "Rust check" { cargo check --manifest-path src-tauri/Cargo.toml }
}

if ($FreeDevPort) {
  Clear-DevPort -Port $DevPort
}

if ($SmokeTestSeconds -gt 0) {
  Write-Host ""
  Write-Host "=== Start Tauri dev (smoke test: ${SmokeTestSeconds}s) ===" -ForegroundColor Cyan
  $devProcess = Start-Process -FilePath "npm.cmd" `
    -ArgumentList @("run", "tauri", "dev") `
    -WorkingDirectory $projectRoot `
    -PassThru `
    -NoNewWindow

  if ($devProcess.WaitForExit($SmokeTestSeconds * 1000)) {
    $devProcess.Refresh()
    $exitCode = if ($null -eq $devProcess.ExitCode) { -1 } else { $devProcess.ExitCode }
    if ($exitCode -ne 0) {
      throw "Start Tauri dev failed with exit code $exitCode"
    }
    throw "tauri dev exited too early; smoke test failed."
  }

  Write-Host "tauri dev stayed alive for ${SmokeTestSeconds}s; stopping process tree..." -ForegroundColor Green
  taskkill /PID $devProcess.Id /T /F | Out-Null
  Write-Host "Smoke test passed." -ForegroundColor Green
} else {
  Invoke-Step "Start Tauri dev" { npm run tauri dev }
}
