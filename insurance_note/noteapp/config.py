"""공통 설정 및 경로."""
from __future__ import annotations

import os
from pathlib import Path

# insurance_note/ 디렉터리
BASE_DIR = Path(__file__).resolve().parent.parent


def _configured_dir(filename: str) -> str:
    """설정 파일 첫 줄에 적힌 폴더 경로(주석·빈 줄은 건너뛴다)."""
    path = BASE_DIR / filename
    if not path.exists():
        return ""
    try:
        rows = path.read_text(encoding="utf-8", errors="ignore").splitlines()
    except OSError:
        return ""
    for row in rows:
        row = row.strip()
        if row and not row.startswith("#"):
            return row
    return ""


# 약관 PDF 폴더.  약관을 프로그램 폴더 밖(예: C:\진이폴더\보험\약관)에 두고 쓰려면
# '약관폴더.txt' 첫 줄에 그 경로를 적는다. 적지 않으면 예전처럼 저장소 최상위를 쓴다.
TERMS_DIR = Path(os.environ.get("TERMS_DIR")
                 or _configured_dir("약관폴더.txt")
                 or BASE_DIR.parent)
DATA_DIR = Path(os.environ.get("NOTE_DATA_DIR", BASE_DIR / "data"))
INDEX_DB = Path(os.environ.get("NOTE_INDEX_DB", DATA_DIR / "terms_index.sqlite"))
UPLOAD_DIR = Path(os.environ.get("NOTE_UPLOAD_DIR", BASE_DIR / "uploads"))
OUTPUT_DIR = Path(os.environ.get("NOTE_OUTPUT_DIR", BASE_DIR / "output"))


def obsidian_vault() -> str:
    """옵시디언 보관함 폴더(옵시디언_폴더.txt 첫 줄)."""
    return os.environ.get("NOTE_VAULT") or _configured_dir("옵시디언_폴더.txt")


# OCR (스캔 제안서) 설정
OCR_LANG = os.environ.get("NOTE_OCR_LANG", "kor+eng")
OCR_DPI = int(os.environ.get("NOTE_OCR_DPI", "300"))
# 페이지에서 이 글자 수 미만이 추출되면 스캔본으로 보고 OCR 을 시도한다.
TEXT_LAYER_MIN_CHARS = int(os.environ.get("NOTE_TEXT_MIN_CHARS", "40"))

for _d in (DATA_DIR, UPLOAD_DIR, OUTPUT_DIR):
    _d.mkdir(parents=True, exist_ok=True)
