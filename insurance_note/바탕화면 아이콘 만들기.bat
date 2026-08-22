@echo off
chcp 65001 >nul
cd /d "%~dp0"

set "PY="
where py >nul 2>nul && set "PY=py -3"
if not defined PY (
  where python >nul 2>nul && set "PY=python"
)
if not defined PY (
  type "tools\\no_python.txt"
  echo.
  pause
  exit /b 1
)

%PY% "tools\\make_shortcut.py"
echo.
pause
