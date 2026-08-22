@echo off
cd /d "%~dp0"
set "PY="
where py >nul 2>nul && set "PY=py -3"
if not defined PY where python >nul 2>nul && set "PY=python"
if not defined PY (
  echo Python is not installed. Please install Python first.
  pause
  exit /b 1
)
%PY% "tools\\make_shortcut.py"
pause
