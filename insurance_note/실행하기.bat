@echo off
cd /d "%~dp0"
set "PY="
where py >nul 2>nul && set "PY=py -3"
if not defined PY where python >nul 2>nul && set "PY=python"
if not defined PY (
  echo Python is not installed.
  echo Please install it from https://www.python.org/downloads/
  echo Check "Add Python to PATH" during setup.
  pause
  exit /b 1
)
%PY% "tools\\launcher.py"
if errorlevel 1 pause
