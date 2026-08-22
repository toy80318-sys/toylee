"""상품제안서(스캔본 포함) 읽기.

1) PDF 에 글자 정보가 있으면 그대로 읽고,
2) 스캔 이미지라 글자가 없으면 tesseract OCR(한국어)로 읽는다.
3) 어느 쪽도 어려우면 사용자가 화면에서 직접 특약을 추가·수정할 수 있다.
"""
from __future__ import annotations

import re
import shutil
import subprocess
from dataclasses import dataclass, field, asdict
from pathlib import Path

import pymupdf

from . import config
from .indexer import extract_text
from .textutil import compact, normalize_space

IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".bmp", ".tif", ".tiff", ".webp"}


# ---------------------------------------------------------------- OCR

def ocr_available() -> bool:
    return shutil.which("tesseract") is not None


def ocr_image_bytes(data: bytes, lang: str | None = None) -> str:
    """tesseract 로 이미지 한 장을 읽는다."""
    if not ocr_available():
        raise RuntimeError(
            "OCR 프로그램(tesseract)이 설치되어 있지 않습니다.\n"
            "  · Windows: https://github.com/UB-Mannheim/tesseract/wiki 에서 설치(한국어 선택)\n"
            "  · macOS  : brew install tesseract tesseract-lang\n"
            "  · Ubuntu : sudo apt install tesseract-ocr tesseract-ocr-kor")
    lang = lang or config.OCR_LANG
    proc = subprocess.run(
        ["tesseract", "stdin", "stdout", "-l", lang, "--psm", "6"],
        input=data, capture_output=True)
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.decode("utf-8", "ignore")[:500])
    return proc.stdout.decode("utf-8", "ignore")


def read_document(path: Path, force_ocr: bool = False) -> tuple[list[str], bool]:
    """제안서 파일 -> (페이지별 텍스트, OCR 사용 여부)"""
    path = Path(path)
    used_ocr = False
    if path.suffix.lower() in IMAGE_SUFFIXES:
        return [ocr_image_bytes(path.read_bytes())], True
    if path.suffix.lower() == ".txt":
        return [path.read_text(encoding="utf-8", errors="ignore")], False

    doc = pymupdf.open(path)
    pages: list[str] = []
    try:
        for i in range(len(doc)):
            page = doc[i]
            text = "" if force_ocr else extract_text(page)
            if len(compact(text)) < config.TEXT_LAYER_MIN_CHARS:
                if ocr_available():
                    pix = page.get_pixmap(dpi=config.OCR_DPI)
                    text = ocr_image_bytes(pix.tobytes("png"))
                    used_ocr = True
                else:
                    text = text or ""
            pages.append(text)
    finally:
        doc.close()
    return pages, used_ocr


# ---------------------------------------------------------------- 파싱

MONEY = r"(?:\d{1,3}(?:,\d{3})+|\d+)"
_AMOUNT = re.compile(rf"({MONEY}(?:\.\d+)?)\s*(억원|만원|천원|원|구좌|좌)")
_PREMIUM_HINT = re.compile(r"(보험료|월납|월\s*보험료)")
_PERIOD = re.compile(r"((?:\d+년|\d+세|전기|종신)\s*(?:납입|납|만기|갱신))")
_BIRTH = re.compile(r"(\d{4})[.\-/년]\s*(\d{1,2})[.\-/월]\s*(\d{1,2})")
_RRN = re.compile(r"(\d{6})\s*[-–]\s*(\d)\d{0,6}")
_NAME_LINE = re.compile(r"(피보험자|계약자|고객)\s*(?:명|성명)?\s*[:：]?\s*([가-힣]{2,5})")
_RIDER_HINT = re.compile(r"(특약|주계약|보험\s*$|보장)")
_SKIP_LINE = re.compile(r"(합\s*계|총\s*계|납입보험료\s*합계|페이지|가입설계서|서명|안내|주의|면책|www|보험료\s*계)")


@dataclass
class Rider:
    name: str
    amount: str = ""
    premium: str = ""
    period: str = ""
    raw: str = ""

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class Proposal:
    customer_name: str = ""
    birth: str = ""
    gender: str = ""
    product: str = ""
    total_premium: str = ""
    riders: list[Rider] = field(default_factory=list)
    raw_text: str = ""
    used_ocr: bool = False
    pages: int = 0

    def to_dict(self) -> dict:
        d = asdict(self)
        d["riders"] = [r.to_dict() for r in self.riders]
        return d


def _clean_name(text: str) -> str:
    text = normalize_space(text)
    text = re.sub(r"^[（(]\s*무\s*[)）]\s*", "무배당 ", text)   # (무) -> 무배당
    text = re.sub(r"^\s*[\d]{1,2}\s*[.)]\s+", "", text)       # 앞머리 목록번호(1. / 2) …)
    text = re.sub(r"^[\s*·\-–—]+", "", text)                    # 앞머리 기호
    text = re.sub(r"[\s*]*주석\s*참조[\s*]*$", "", text)         # 꼬리의 '*주석참조'

    text = re.sub(r"\s{2,}", " ", text)
    text = re.sub(r"[·\-–—]{2,}", " ", text)
    return text.strip(" .·:|")


_NUM_TOKEN = re.compile(rf"(?<![\d,])({MONEY})(?![\d,])")


def _split_cells(line: str) -> list[str]:
    """표 한 줄을 칸으로 나눈다(공백 2칸 이상 · 탭 · | 기준)."""
    cells = [c.strip() for c in re.split(r"\s{2,}|\t|\|", line) if c.strip()]
    return cells


def _split_name_values(line: str) -> tuple[str, str]:
    """'특약명' 과 '금액·보험료 부분' 으로 나눈다."""
    cells = _split_cells(line)
    if len(cells) >= 2:
        return cells[0], " ".join(cells[1:])
    m = _AMOUNT.search(line)
    if m:
        return line[: m.start()], line[m.start():]
    # 마지막 수단: 이름 뒤에 떨어져 나오는 숫자 토큰 기준
    for m in _NUM_TOKEN.finditer(line):
        if m.start() > 0 and line[m.start() - 1] == " ":
            return line[: m.start()], line[m.start():]
    return line, ""


def parse_riders(text: str) -> list[Rider]:
    """제안서 본문에서 '특약명 + 가입금액 + 보험료' 줄을 찾아낸다."""
    riders: list[Rider] = []
    seen: set[str] = set()
    for raw_line in text.split("\n"):
        line = normalize_space(raw_line)
        if len(line) < 4 or _SKIP_LINE.search(line):
            continue
        if not _RIDER_HINT.search(line):
            continue
        name_part, values = _split_name_values(line)
        name = _clean_name(name_part)
        ck = compact(name)
        is_main = "주계약" in ck
        if not is_main and "특약" not in ck:
            continue
        if len(ck) < 3:
            continue
        amounts = _AMOUNT.findall(values) or _AMOUNT.findall(line)
        amount = f"{amounts[0][0]}{amounts[0][1]}" if amounts else ""
        if not amount and re.search(r"주석\s*참조", line):
            amount = "주석 참조"
        period = " / ".join(dict.fromkeys(_PERIOD.findall(values or line)))
        premium = ""
        # 보험료: 값 부분의 숫자 중 금액·기간에 쓰이지 않은 마지막 숫자
        used = {amounts[0][0]} if amounts else set()
        candidates = []
        for m in _NUM_TOKEN.finditer(values):
            tok = m.group(1)
            after = values[m.end():m.end() + 2]
            if tok in used or re.match(r"\s*(만원|억원|년|세|좌|구좌|%)", after):
                continue
            candidates.append(tok)
        if candidates:
            premium = candidates[-1]
        if ck in seen:
            continue
        seen.add(ck)
        riders.append(Rider(name=name, amount=amount, premium=premium,
                            period=period, raw=line))
    return riders


def parse_customer(text: str) -> dict:
    info = {"customer_name": "", "birth": "", "gender": ""}
    m = _NAME_LINE.search(text)
    if m:
        info["customer_name"] = m.group(2)
    m = _BIRTH.search(text)
    if m:
        info["birth"] = f"{m.group(1)}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"
    else:
        m = _RRN.search(text)
        if m:
            yy = int(m.group(1)[:2])
            code = int(m.group(2))
            century = 1900 if code in (1, 2, 5, 6) else 2000
            info["birth"] = (f"{century + yy}-{m.group(1)[2:4]}-{m.group(1)[4:6]}")
            info["gender"] = "남" if code % 2 == 1 else "여"
    if not info["gender"]:
        if re.search(r"성별\s*[:：]?\s*남", text):
            info["gender"] = "남"
        elif re.search(r"성별\s*[:：]?\s*여", text):
            info["gender"] = "여"
    return info


def guess_product(text: str) -> str:
    for line in text.split("\n")[:60]:
        line = normalize_space(line)
        if not re.search(r"(보험|종신|플랜)", line):
            continue
        if re.search(r"(특약|계약자|피보험자|주민|성별|생년|설계|합계|[:：])", line):
            continue
        if 4 <= len(line) <= 45:
            return _clean_name(line)
    return ""


def parse_text(text: str) -> Proposal:
    prop = Proposal(raw_text=text)
    info = parse_customer(text)
    prop.customer_name = info["customer_name"]
    prop.birth = info["birth"]
    prop.gender = info["gender"]
    prop.product = guess_product(text)
    prop.riders = parse_riders(text)
    m = re.search(rf"(?:합계|총)\s*보험료\s*[:：]?\s*({MONEY})", text)
    if m:
        prop.total_premium = m.group(1)
    return prop


def merge(parts: list[Proposal]) -> Proposal:
    """여러 파일에서 읽은 결과를 하나로 합친다(스캔본이 여러 장일 때)."""
    parts = [p for p in parts if p is not None]
    if not parts:
        return Proposal()
    if len(parts) == 1:
        return parts[0]

    out = Proposal()
    seen: set[tuple[str, str, str]] = set()
    for part in parts:
        out.customer_name = out.customer_name or part.customer_name
        out.birth = out.birth or part.birth
        out.gender = out.gender or part.gender
        out.product = out.product or part.product
        out.total_premium = out.total_premium or part.total_premium
        out.used_ocr = out.used_ocr or part.used_ocr
        out.pages += part.pages
        out.raw_text = (out.raw_text + "\n" + part.raw_text).strip()
        for rider in part.riders:
            # 페이지가 겹쳐 같은 줄이 두 번 읽히는 경우만 걸러낸다.
            key = (compact(rider.name), rider.amount, rider.premium)
            if key in seen:
                continue
            seen.add(key)
            out.riders.append(rider)
    return out


def parse_files(paths: list[Path], force_ocr: bool = False) -> Proposal:
    """제안서 파일 여러 개를 한 번에 읽는다."""
    return merge([parse_file(Path(p), force_ocr=force_ocr) for p in paths])


def parse_file(path: Path, force_ocr: bool = False) -> Proposal:
    pages, used_ocr = read_document(Path(path), force_ocr=force_ocr)
    text = "\n".join(pages)
    prop = parse_text(text)
    prop.used_ocr = used_ocr
    prop.pages = len(pages)
    return prop
