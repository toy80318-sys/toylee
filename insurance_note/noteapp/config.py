"""공통 설정 및 경로."""
from __future__ import annotations

import os
from pathlib import Path

# insurance_note/ 디렉터리
BASE_DIR = Path(__file__).resolve().parent.parent
# 약관 PDF 들이 들어있는 폴더 (기본값: 저장소 최상위)
TERMS_DIR = Path(os.environ.get("TERMS_DIR", BASE_DIR.parent))
DATA_DIR = Path(os.environ.get("NOTE_DATA_DIR", BASE_DIR / "data"))
INDEX_DB = Path(os.environ.get("NOTE_INDEX_DB", DATA_DIR / "terms_index.sqlite"))
UPLOAD_DIR = Path(os.environ.get("NOTE_UPLOAD_DIR", BASE_DIR / "uploads"))
OUTPUT_DIR = Path(os.environ.get("NOTE_OUTPUT_DIR", BASE_DIR / "output"))

# OCR (스캔 제안서) 설정
OCR_LANG = os.environ.get("NOTE_OCR_LANG", "kor+eng")
OCR_DPI = int(os.environ.get("NOTE_OCR_DPI", "300"))
# 페이지에서 이 글자 수 미만이 추출되면 스캔본으로 보고 OCR 을 시도한다.
TEXT_LAYER_MIN_CHARS = int(os.environ.get("NOTE_TEXT_MIN_CHARS", "40"))

for _d in (DATA_DIR, UPLOAD_DIR, OUTPUT_DIR):
    _d.mkdir(parents=True, exist_ok=True)
