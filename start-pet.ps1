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
if (-not (Test-Path "$projectDir\vendor\openclaw-runtime\current")) {
  Write-Host "OpenClaw runtime missing, building it (first run only, can take several minutes)..." -ForegroundColor Yellow
  # The runtime build needs pnpm; Corepack ships it per the source's pinned
  # version. Enable it up front so the build's `need_cmd pnpm` check passes.
  & corepack enable 2>$null
  & npm run openclaw:runtime:host
  if ($LASTEXITCODE -ne 0) {
    Write-Host "Runtime build failed. Tip: enable Windows Developer Mode (Settings > Privacy & security > For developers) so symlinks are allowed, then run 'npm run pet' again." -ForegroundColor Red
    exit 1
  }
}

# Free port 5175 (electron:dev uses strictPort; a stale process would block it).
Write-Host "Freeing port 5175 ..." -ForegroundColor DarkGray
Get-NetTCPConnection -LocalPort 5175 -State Listen -ErrorAction SilentlyContinue |
  ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }

# Hand off to the project's own dev pipeline (port / compile / wait-for-ready built in).
& npm run electron:dev
