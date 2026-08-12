#!/bin/bash
# 맥에서 프로그램을 켜는 파일입니다. 이 파일을 더블클릭하세요.
# (처음에는 마우스 오른쪽 버튼 → 열기 를 한 번 해주셔야 할 수 있습니다)
cd "$(dirname "$0")" || exit 1

# 고객 자료를 다른 폴더에 두고 싶으시면 아래 줄의 # 을 지우고 경로를 고치세요.
# export DB_PATH="$HOME/교보평생든든/kyobo.db"

export PORT=3222

echo
echo "  =================================================="
echo "    평생든든 방문활동 사전준비 · 자동분석 프로그램"
echo "  =================================================="
echo

if ! command -v node > /dev/null 2>&1; then
  echo "  [알림] 프로그램을 켜려면 Node.js 가 한 번 설치되어 있어야 합니다."
  echo "         곧 열리는 nodejs.org 에서 [LTS] 를 받아 설치하신 뒤"
  echo "         이 파일을 다시 열어 주세요."
  open "https://nodejs.org/ko"
  read -r -p "  엔터를 누르면 닫힙니다..."
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "  처음 실행이라 준비 작업을 합니다. 2~3분 걸립니다. 창을 닫지 마세요..."
  npm install --no-audit --no-fund || { echo "  준비 작업에 실패했습니다."; read -r; exit 1; }
fi

( sleep 4; open "http://localhost:$PORT" ) &

echo "  프로그램을 켜는 중입니다. 잠시 후 브라우저가 저절로 열립니다."
echo "  주소 : http://localhost:$PORT"
echo "  자료 : 이 폴더의 data 안 kyobo.db 파일 하나에 담깁니다."
echo
echo "  ※ 다 쓰신 뒤에는 이 창을 닫으면 프로그램이 꺼집니다."
echo

node server/index.js

echo
echo "  프로그램이 종료되었습니다."
read -r -p "  엔터를 누르면 닫힙니다..."
