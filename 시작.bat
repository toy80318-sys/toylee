@echo off
chcp 65001 >nul
setlocal
title 평생든든 고객 정보파악 프로그램
cd /d "%~dp0"

rem ── 프로그램을 켜는 파일입니다. 이 파일을 더블클릭하세요. ──
rem  고객 자료를 다른 폴더에 두고 싶으시면 아래 줄 앞의 rem 을 지우고 경로를 고치세요.
rem  set DB_PATH=D:\AI\교보평생든든\고객DB\kyobo.db

set PORT=3000

echo.
echo  ==================================================
echo    평생든든 방문활동 사전준비 · 자동분석 프로그램
echo  ==================================================
echo.

rem ── Node.js 설치 확인 ──
where node >nul 2>nul
if errorlevel 1 (
  echo  [알림] 프로그램을 켜려면 Node.js 가 한 번 설치되어 있어야 합니다.
  echo.
  echo   1. 곧 열리는 nodejs.org 에서 [LTS] 를 내려받아 설치하세요.
  echo      설치 중에 나오는 선택은 모두 그대로 [다음] 을 누르시면 됩니다.
  echo   2. 설치가 끝나면 이 파일을 다시 더블클릭하세요.
  echo.
  start "" https://nodejs.org/ko
  pause
  exit /b 1
)

rem ── 처음 한 번만 준비 작업 ──
if not exist "node_modules" (
  echo  처음 실행이라 준비 작업을 합니다. 2~3분 걸립니다. 창을 닫지 마세요...
  echo.
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo.
    echo  [알림] 준비 작업에 실패했습니다. 인터넷 연결을 확인하고 다시 시도해 주세요.
    pause
    exit /b 1
  )
  echo.
  echo  준비가 끝났습니다.
  echo.
)

rem ── 서버가 뜨면 브라우저를 자동으로 엽니다 ──
start "" /b cmd /c "timeout /t 4 >nul & start "" http://localhost:%PORT%"

echo  프로그램을 켜는 중입니다. 잠시 후 브라우저가 저절로 열립니다.
echo.
echo  주소  : http://localhost:%PORT%
echo  자료  : 이 폴더의 data 안에 있는 kyobo.db 파일 하나에 담깁니다.
echo.
echo  ※ 다 쓰신 뒤에는 이 검은 창을 닫으면 프로그램이 꺼집니다.
echo    (창을 닫아도 저장하신 고객 자료는 그대로 남습니다)
echo.

node server/index.js

echo.
echo  ==================================================
echo   프로그램이 종료되었습니다.
echo.
echo   갑자기 꺼졌다면 위에 적힌 내용을 확인해 주세요.
echo   "EADDRINUSE" 라고 적혀 있으면 프로그램이 이미 켜져 있는 것입니다.
echo   그때는 브라우저에서 http://localhost:%PORT% 를 바로 여시면 됩니다.
echo  ==================================================
pause
