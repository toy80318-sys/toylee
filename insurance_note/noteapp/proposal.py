"""상품제안서(스캔본 포함) 읽기.

1) PDF 에 글자 정보가 있으면 그대로 읽고,
2) 스캔 이미지라 글자가 없으면 tesseract OCR(한국어)로 읽는다.
3) 어느 쪽도 어려우면 사용자가 화면에서 직접 특약을 추가·수정할 수 있다.
"""
from __future__ import annotations

import os
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

def _ocr_candidates() -> list[str]:
    """설치는 했지만 PATH 에 안 잡히는 경우가 잦아 흔한 설치 위치를 직접 본다."""
    home = Path.home()
    return [
        r"C:\Program Files\Tesseract-OCR\tesseract.exe",
        r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
        r"C:\Tesseract-OCR\tesseract.exe",
        # 관리자 권한 없이 설치하면 사용자 폴더로 들어간다
        str(home / "AppData/Local/Programs/Tesseract-OCR/tesseract.exe"),
        str(home / "AppData/Local/Tesseract-OCR/tesseract.exe"),
        str(home / "scoop/shims/tesseract.exe"),
        r"C:\ProgramData\chocolatey\bin\tesseract.exe",
        "/opt/homebrew/bin/tesseract",
        "/usr/local/bin/tesseract",
        "/usr/bin/tesseract",
    ]

OCR_HELP = ("사진·스캔본에서 글자를 읽으려면 OCR 프로그램(tesseract)이 필요합니다. "
            "https://github.com/UB-Mannheim/tesseract/wiki 에서 설치하면서 "
            "'Additional language data' 에서 Korean 을 꼭 선택해 주세요. "
            "설치 뒤 이 프로그램을 껐다 켜면 자동으로 인식합니다.")


def tesseract_path() -> str | None:
    """OCR 프로그램의 위치. PATH 에 없으면 흔한 설치 경로도 찾아본다."""
    fixed = os.environ.get("NOTE_TESSERACT", "").strip()
    if fixed:
        return fixed if Path(fixed).exists() else None
    found = shutil.which("tesseract")
    if found:
        return found
    for path in _ocr_candidates():
        if Path(path).exists():
            return path
    return None


def ocr_status() -> str:
    """실행 창에 보여 줄 한 줄 요약(설치 여부와 찾은 위치)."""
    exe = tesseract_path()
    if exe:
        return f"사용 가능 ({exe})"
    return "미설치 — 사진·스캔본은 읽지 못합니다(PDF·붙여넣기는 가능)"


def ocr_available() -> bool:
    return tesseract_path() is not None


def ocr_image_bytes(data: bytes, lang: str | None = None) -> str:
    """tesseract 로 이미지 한 장을 읽는다."""
    exe = tesseract_path()
    if not exe:
        raise RuntimeError(OCR_HELP)
    lang = lang or config.OCR_LANG
    proc = subprocess.run(
        [exe, "stdin", "stdout", "-l", lang, "--psm", "6"],
        input=data, capture_output=True)
    if proc.returncode != 0 and b"Failed loading language" in (proc.stderr or b""):
        proc = subprocess.run(                # 한국어 자료가 없으면 영어로라도 읽어 본다
            [exe, "stdin", "stdout", "--psm", "6"], input=data, capture_output=True)
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.decode("utf-8", "ignore")[:500])
    return proc.stdout.decode("utf-8", "ignore")


def safe_dpi(page, max_pixels: int = 30_000_000) -> int:
    """페이지를 그림으로 만들 때 쓸 해상도.

    큰 원고(A3·고해상도 스캔)를 그대로 300dpi 로 펼치면 메모리를 수백 MB 쓰다가
    프로그램이 통째로 꺼질 수 있다. 픽셀 수가 한도를 넘지 않도록 해상도를 낮춘다.
    """
    dpi = config.OCR_DPI
    rect = page.rect
    inches = (rect.width / 72.0) * (rect.height / 72.0)
    if inches <= 0:
        return dpi
    if inches * dpi * dpi > max_pixels:
        dpi = int((max_pixels / inches) ** 0.5)
    return max(120, min(dpi, config.OCR_DPI))


def read_document(path: Path, force_ocr: bool = False) -> tuple[list[str], bool]:
    """제안서 파일 -> (페이지별 텍스트, OCR 사용 여부)"""
    path = Path(path)
    used_ocr = False
    suffix = path.suffix.lower()
    if suffix in IMAGE_SUFFIXES:
        return [ocr_image_bytes(path.read_bytes())], True
    if suffix == ".txt":
        return [path.read_text(encoding="utf-8", errors="ignore")], False
    if suffix not in (".pdf", ""):
        raise RuntimeError(f"'{suffix}' 형식은 읽을 수 없습니다. "
                           "PDF 나 사진(PNG·JPG)으로 저장해서 올려 주세요.")

    try:
        doc = pymupdf.open(path)
    except Exception as exc:                          # noqa: BLE001
        raise RuntimeError("PDF 를 열 수 없습니다. 파일이 손상됐거나 암호가 "
                           "걸려 있는지 확인해 주세요.") from exc
    pages: list[str] = []
    try:
        for i in range(len(doc)):
            page = doc[i]
            text = "" if force_ocr else extract_text(page)
            if len(compact(text)) < config.TEXT_LAYER_MIN_CHARS:
                if ocr_available():
                    pix = page.get_pixmap(dpi=safe_dpi(page))
                    try:
                        text = ocr_image_bytes(pix.tobytes("png"))
                    finally:
                        del pix                   # 큰 스캔본에서 메모리를 바로 돌려준다
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
    sources: list[str] = field(default_factory=list)      # 실제로 읽어낸 파일 이름
    problems: list[str] = field(default_factory=list)     # 못 읽은 파일과 그 이유

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
        out.sources += part.sources
        out.problems += part.problems
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
    """제안서 파일 여러 개를 한 번에 읽는다.

    한 파일이 잘못돼도 나머지는 계속 읽고, 실패한 파일과 이유만 따로 모아 둔다.
    (스캔본 여러 장 중 한 장만 손상된 경우에도 나머지 장은 살린다.)
    """
    parts: list[Proposal] = []
    problems: list[str] = []
    for path in paths:
        path = Path(path)
        try:
            parts.append(parse_file(path, force_ocr=force_ocr))
        except Exception as exc:                      # noqa: BLE001 - 이유를 화면에 그대로 보여준다
            problems.append(f"{path.name}: {_reason(exc)}")
    out = merge(parts)
    out.problems += problems
    return out


def _reason(exc: Exception) -> str:
    text = normalize_space(str(exc)) or exc.__class__.__name__
    return text if len(text) <= 200 else text[:200] + "…"


def parse_file(path: Path, force_ocr: bool = False) -> Proposal:
    path = Path(path)
    pages, used_ocr = read_document(path, force_ocr=force_ocr)
    text = "\n".join(pages)
    prop = parse_text(text)
    prop.used_ocr = used_ocr
    prop.pages = len(pages)
    prop.sources = [path.name]
    return prop
