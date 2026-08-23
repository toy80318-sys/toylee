"""약관·제안서 텍스트를 다루기 위한 문자열 유틸리티."""
from __future__ import annotations

import re
import unicodedata

# 약관 PDF 는 상품에 따라 글자 사이 공백이 모두 빠진 채로 추출되기도 한다.
# 규칙 매칭은 공백을 모두 없앤 "압축본" 위에서 수행한다.
_WS = re.compile(r"\s+")
_PUNCT = re.compile(r"[\s··,\.\-–—_/\\()（）\[\]{}「」『』\"'“”‘’:;!?~∼〜]+")
# 로마숫자 표기(Ⅱ, II, ii …)는 모두 아라비아 숫자로 통일한다.
# 긴 표기부터 치환해야 "II" 가 "11" 로 잘못 바뀌지 않는다.
_ROMAN = [("Ⅷ", "8"), ("Ⅶ", "7"), ("Ⅵ", "6"), ("Ⅸ", "9"), ("Ⅹ", "10"), ("Ⅴ", "5"),
          ("Ⅳ", "4"), ("Ⅲ", "3"), ("Ⅱ", "2"), ("Ⅰ", "1"),
          ("VIII", "8"), ("VII", "7"), ("VI", "6"), ("III", "3"), ("II", "2"),
          ("IX", "9"), ("IV", "4"), ("V", "5"), ("X", "10"), ("I", "1")]
_CIRCLED = {chr(0x2460 + i): f"{i + 1}." for i in range(20)}


def _apply_roman(s: str) -> str:
    """로마숫자 표기를 아라비아 숫자로. 단어 안의 영문 I/V/X 는 건드리지 않는다."""
    for k, v in _ROMAN:
        if k.isascii():
            s = re.sub(rf"(?<![A-Za-z]){re.escape(k)}(?![A-Za-z])", v, s)
        else:
            s = s.replace(k, v)
    return s


def compact(text: str) -> str:
    """공백을 모두 제거한 형태. 규칙(정규식) 매칭 전용."""
    return _WS.sub("", text or "")


def normalize_space(text: str) -> str:
    """줄바꿈/중복 공백을 정리한 읽기용 텍스트."""
    text = (text or "").replace(" ", " ")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


_NEW_ITEM = re.compile(
    r"^(제\s*\d+\s*[조관장]|\d+\.\s|[가-하]\.\s|[①-⑳]|[（(]\s*별표|[【■▶◆※]|다만[,\s]|<)")
_ENDS = re.compile(r"([다요](\.|\。)|[:：]|\.)$")


def join_lines(text: str) -> str:
    """PDF 줄바꿈으로 잘린 문장을 한 문장(한 줄)으로 잇는다.

    한글 본문은 줄 끝에서 단어 중간이 잘리므로 그대로 붙이고,
    새 항목(제N조, 1., 가., ①, 다만 …)이 시작되면 줄을 나눈다.
    """
    out: list[str] = []
    for raw in (text or "").split("\n"):
        line = raw.strip()
        if not line:
            continue
        if out and not _NEW_ITEM.match(line) and not _ENDS.search(out[-1]):
            prev = out[-1]
            if re.search(r"[가-힣（(\"\'“‘]$", prev) or re.match(r"^[가-힣)\"\'”’]", line):
                out[-1] = prev + line
            else:
                out[-1] = prev + " " + line
        else:
            out.append(line)
    return "\n".join(out)


# 상품 표기에만 쓰이고 보장 내용과 무관한 말들(매칭 전에 제거)
_NOISE_WORDS = ("무해약환급금형", "저해약환급금형", "무해약환급금", "해약환급금미지급형",
                "간편심사", "간편가입", "간편n355", "간편n", "n355", "간편")
# 같은 보장을 다르게 적는 표기
_SYNONYMS = (("허혈성", "허혈"), ("뇌졸증", "뇌졸중"), ("싸이버나이프", "사이버나이프"))


def key(name: str) -> str:
    """특약명 비교용 키. 공백/기호/무배당 표기/로마숫자 차이를 없앤다."""
    s = unicodedata.normalize("NFKC", name or "")
    s = _apply_roman(s)
    s = _PUNCT.sub("", s)
    low = s.lower()
    for w in _NOISE_WORDS:
        low = low.replace(w, "")
    for a, b in _SYNONYMS:
        low = low.replace(a, b)
    s = low
    s = s.replace("무배당", "").replace("무", "무") if s.startswith("무배당") else s
    s = re.sub(r"^\(?무\)?(?=[가-힣A-Za-z])", "", s)
    s = s.replace("무배당", "")
    s = s.replace("주계약", "").replace("보통약관", "")
    return s.lower()


def core_key(name: str) -> str:
    """형태 표시(갱신형·H형·Ⅱ·New 등)를 걷어낸 핵심 이름 키.

    '무배당 암진단특약H' 와 'New무배당암진단특약' 을 같은 보장으로 알아보기 위한 키.
    """
    k = key(name)
    for w in ("갱신형", "무해약환급금형", "저해약환급금형", "일반형", "무해약", "저해약"):
        k = k.replace(w, "")
    k = re.sub(r"^new", "", k)
    k = re.sub(r"\d*형$", "", k)
    k = re.sub(r"\d+$", "", k)
    k = re.sub(r"[hl]$", "", k)
    return k


def tokens(name: str) -> set[str]:
    """이름 비교용 토큰(2글자 이상 한글/영문/숫자 조각)."""
    s = unicodedata.normalize("NFKC", name or "")
    s = _apply_roman(s)
    parts = re.split(r"[^0-9A-Za-z가-힣]+", s)
    out = set()
    for p in parts:
        if not p or p in ("무배당", "무", "특약", "약관"):
            continue
        out.add(p.lower())
        # 붙어 있는 한글 덩어리는 2~4글자 단위로도 잘라 부분 일치를 돕는다.
        if len(p) > 4:
            for n in (2, 3):
                for i in range(len(p) - n + 1):
                    out.add(p[i:i + n].lower())
    return out


def circled_to_number(text: str) -> str:
    """①②③ … 을 1. 2. 3. 으로 바꾼다."""
    for k, v in _CIRCLED.items():
        text = text.replace(k, "\n" + v + " ")
    return text


def sentences(text: str) -> list[str]:
    """마침표 기준 문장 분리(약관 문체에 맞춘 단순 규칙)."""
    text = normalize_space(join_lines(text))
    raw = re.split(r"(?<=니다\.)\s*|(?<=합니다\.)\s*|\n+", text)
    return [s.strip() for s in raw if s and s.strip()]


def shorten(text: str, limit: int = 220) -> str:
    text = normalize_space(text)
    if len(text) <= limit:
        return text
    return text[: limit - 1].rstrip() + "…"
