#!/bin/bash
# 맥·리눅스용 실행 파일 — 더블클릭하면 프로그램이 켜집니다.
cd "$(dirname "$0")" || exit 1
PY=$(command -v python3 || command -v python)
if [ -z "$PY" ]; then
  echo "파이썬(python3)이 설치되어 있지 않습니다."
  echo "  macOS: brew install python   /   Ubuntu: sudo apt install python3 python3-pip"
  read -r -p "Enter 키를 누르면 닫힙니다..." _
  exit 1
fi
"$PY" tools/launcher.py
status=$?
if [ $status -ne 0 ]; then
  read -r -p "Enter 키를 누르면 닫힙니다..." _
fi
exit $status
