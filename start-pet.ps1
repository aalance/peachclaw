# ============================================================
#  LobsterAI Desktop Pet - launcher (called by `npm run pet`)
#  Reuses the project's proven electron:dev pipeline:
#    clean dist-electron -> tsc compile main -> Vite(5175) -> Electron
#  Usage: npm run pet  OR  run this file  OR  double-click 启动桌宠.bat
#  NOTE: keep this file ASCII-only so Windows PowerShell parses it
#        regardless of console codepage.
# ============================================================
$ErrorActionPreference = "Stop"
$projectDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $projectDir

# Make the console UTF-8 so OpenClaw log glyphs (arrows / checks) are not garbled.
cmd /c "chcp 65001 >nul"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "==================================" -ForegroundColor Cyan
Write-Host "  LobsterAI Desktop Pet starting..." -ForegroundColor Cyan
Write-Host "  First run / after edits compiles (~15-40s). Please wait." -ForegroundColor DarkGray
Write-Host "  Success = Peach appears at the bottom-right. Keep this window open." -ForegroundColor DarkGray
Write-Host "==================================" -ForegroundColor Cyan

# Install dependencies on first run.
if (-not (Test-Path "$projectDir\node_modules\.bin\vite.cmd")) {
  Write-Host "Dependencies missing, installing (first run only)..." -ForegroundColor Yellow
  & npm install
}

# Provision the bundled OpenClaw runtime if absent. Without it the workbench
# reports "未检测到内置 OpenClaw 运行时(cfmind)". The build lands in
# vendor\openclaw-runtime\current and is reused on later runs (first run is slow).
#
# Presence of current\ is NOT enough to call the runtime complete. The build is
# a chain -- sync-current creates current\ at step 4, but plugins are installed
# at step 6. An interrupted build therefore leaves current\ in place with no
# channel plugins, and the old "-not (Test-Path current)" guard then skipped the
# rebuild forever. The app still started; only the IM channels were silently
# dead, surfacing as "web login provider is not available" on the WeChat screen.
# So verify the plugins actually landed, and repair just that step when they did
# not (much cheaper than a full rebuild).
$runtimeDir = Join-Path $projectDir "vendor\openclaw-runtime\current"
$extensionsDir = Join-Path $runtimeDir "third-party-extensions"

# Optional plugins live on registries not everyone can reach, so a missing one
# is not a build failure -- only the required ids gate the check.
$requiredPlugins = @()
try {
  $pkg = Get-Content (Join-Path $projectDir "package.json") -Raw | ConvertFrom-Json
  foreach ($plugin in $pkg.openclaw.plugins) {
    if (-not $plugin.optional) { $requiredPlugins += $plugin.id }
  }
} catch {
  Write-Host "Could not read the plugin list from package.json; skipping the plugin check." -ForegroundColor Yellow
}

function Get-MissingPlugins {
  $missing = @()
  foreach ($id in $requiredPlugins) {
    if (-not (Test-Path (Join-Path $extensionsDir $id))) { $missing += $id }
  }
  return $missing
}

if (-not (Test-Path $runtimeDir)) {
  Write-Host "OpenClaw runtime missing, building it (first run only, can take several minutes)..." -ForegroundColor Yellow
  Write-Host "  Do not close this window until you see [7/7] Done." -ForegroundColor DarkGray
  # The runtime build needs pnpm; Corepack ships it per the source's pinned
  # version. Enable it up front so the build's `need_cmd pnpm` check passes.
  & corepack enable 2>$null
  & npm run openclaw:runtime:host
  if ($LASTEXITCODE -ne 0) {
    Write-Host "Runtime build failed. Tip: enable Windows Developer Mode (Settings > Privacy & security > For developers) so symlinks are allowed, then run 'npm run pet' again." -ForegroundColor Red
    exit 1
  }
}

$missingPlugins = Get-MissingPlugins
if ($missingPlugins.Count -gt 0) {
  Write-Host "OpenClaw runtime is incomplete - missing channel plugins: $($missingPlugins -join ', ')" -ForegroundColor Yellow
  Write-Host "Installing them now (needs network access to npm)..." -ForegroundColor Yellow
  & npm run openclaw:plugins
  $missingPlugins = Get-MissingPlugins
  if ($missingPlugins.Count -gt 0) {
    Write-Host "Still missing after repair: $($missingPlugins -join ', ')" -ForegroundColor Red
    Write-Host "IM channels (WeChat, WeCom, DingTalk, Feishu, ...) will not work." -ForegroundColor Red
    Write-Host "To rebuild the runtime from scratch, delete vendor\openclaw-runtime and run 'npm run pet' again." -ForegroundColor Red
    Write-Host "Starting the pet anyway - everything except the IM channels works." -ForegroundColor DarkGray
  }
}

# Free port 5175 (electron:dev uses strictPort; a stale process would block it).
Write-Host "Freeing port 5175 ..." -ForegroundColor DarkGray
Get-NetTCPConnection -LocalPort 5175 -State Listen -ErrorAction SilentlyContinue |
  ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }

# Hand off to the project's own dev pipeline (port / compile / wait-for-ready built in).
& npm run electron:dev
