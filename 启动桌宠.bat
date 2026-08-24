@echo off
chcp 65001 >nul
cd /d "%~dp0"
title LobsterAI 桌宠 (保持此窗口打开)

echo ============================================
echo    LobsterAI 桌宠 启动中...
echo ============================================
echo.
echo  说明：
echo   - 首次启动或改过代码会先编译，约需 15-40 秒，请耐心等待。
echo   - 看到桌面右下角出现 Peach 即为成功。
echo   - 本窗口请勿关闭：关闭会一并结束桌宠进程。
echo   - 退出桌宠：在本窗口按 Ctrl+C，或直接关闭它。
echo.

REM 首次运行自动安装依赖
if not exist "node_modules\.bin\vite.cmd" (
  echo [安装] 首次运行，正在安装依赖（仅一次，可能需要几分钟）...
  call npm install
)

REM 释放可能被上次残留进程占用的端口 5175（electron:dev 使用 strictPort，被占用会启动失败）
echo [清理] 释放端口 5175 ...
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 5175 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }" >nul 2>&1

REM 使用项目自带、经过验证的开发启动流程：
REM   清理 dist-electron -> tsc 编译主进程 -> vite(5175) -> 就绪后启动 Electron
call npm run electron:dev

echo.
echo 桌宠进程已结束。
pause
