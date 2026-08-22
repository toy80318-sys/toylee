"""약관 조문을 고객이 이해하기 쉬운 문장으로 바꾸는 규칙 엔진.

- 만들어 내는 문장은 모두 약관 원문에서 뽑은 것이고, 각 항목에는 근거 조문을 함께 남긴다.
- 규칙에 걸리지 않은 내용은 억지로 지어내지 않고 '약관 원문 보기'로 넘긴다.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field, asdict

from . import config
from .store import SectionData, TermsStore
from .textutil import compact, join_lines, normalize_space, shorten

# ---------------------------------------------------------------- 사전

_GLOSSARY: dict | None = None


def glossary() -> dict:
    global _GLOSSARY
    if _GLOSSARY is None:
        path = config.DATA_DIR / "glossary.json"
        _GLOSSARY = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    return _GLOSSARY


# 사전에 없는 항목은 약관 표기의 형태를 보고 쉬운 말을 만들어 준다.
_PLAIN_PATTERNS: list[tuple[re.Pattern, str]] = [
    (re.compile(r"^(.+?)의?\s*악성\s*신생물"), "{0}에 생긴 암"),
    (re.compile(r"^(.+?)의?\s*제자리\s*(?:암|신생물)"), "{0}에 생긴 초기 암(퍼지지 않은 상피내암)"),
    (re.compile(r"^(.+?)의?\s*양성\s*신생물"), "{0}에 생긴 양성 종양(암이 아닌 혹)"),
    (re.compile(r"행동양식\s*불명|미상의\s*신생물"), "양성·악성을 확정하기 어려운 종양(경계성 종양)"),
    (re.compile(r"^(.+?)의?\s*골절"), "{0} 부위의 뼈가 부러진 상태"),
    (re.compile(r"^(.+?)\s*염$"), "{0}에 생긴 염증"),
]


def plain_disease(label: str) -> str:
    """약관 표기(예: '1. 거미막하 출혈') -> 쉬운 설명."""
    cleaned = normalize_space(re.sub(r"^\s*\d+[\.)]\s*", "", label or ""))
    hit = glossary().get("질병용어", {}).get(compact(cleaned), "")
    if hit:
        return hit
    for pattern, tmpl in _PLAIN_PATTERNS:
        m = pattern.search(cleaned)
        if m:
            part = normalize_space(m.group(1)) if m.groups() else ""
            part = part.replace(" 및 ", "·").replace(", ", "·").strip(" ·")
            if part and len(part) <= 24:
                return tmpl.format(part)
            if not m.groups():
                return tmpl
    return ""


def plain_term(term: str) -> str:
    return glossary().get("보험용어", {}).get(compact(term), "")


# ---------------------------------------------------------------- 자료구조

@dataclass
class Fact:
    text: str
    source: str = ""
    priority: int = 50          # 낮을수록 앞에 배치(고객이 먼저 알아야 할 내용)
    kind: str = ""              # 규칙 종류(면책기간·감액·최초1회 …)
    tag: str = ""               # 표 안에 넣을 짧은 표기

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class RiderNote:
    input_name: str                      # 제안서에서 읽은 이름
    matched_name: str = ""               # 약관에서 찾은 이름
    product: str = ""
    section_id: int | None = None
    confidence: float = 0.0
    match_reason: str = ""
    amount: str = ""                     # 가입금액
    premium: str = ""                    # 보험료
    period: str = ""                     # 보험기간/납입기간
    type_label: str = ""                 # 진단형·입원형 등
    headline: str = ""                   # 한 줄 요약
    covered_terms: list[str] = field(default_factory=list)
    definition: str = ""
    definition_source: str = ""
    code_tables: list[dict] = field(default_factory=list)
    payouts: list[Fact] = field(default_factory=list)
    cautions: list[Fact] = field(default_factory=list)
    exclusions: list[Fact] = field(default_factory=list)
    documents: list[str] = field(default_factory=list)
    source_label: str = ""
    group_label: str = ""                # 표의 '구분'
    code_summary: list[str] = field(default_factory=list)   # I60~I69 …
    code_total: int = 0
    pay_basis: str = ""                  # 지급 금액·횟수 한 줄 요약
    key_rules: list[str] = field(default_factory=list)      # 표 안 짧은 주의 태그
    alternatives: list[dict] = field(default_factory=list)
    note: str = ""                       # 설계사 손글씨 메모
    unmatched: bool = False

    def to_dict(self) -> dict:
        d = asdict(self)
        d["payouts"] = [f.to_dict() for f in self.payouts]
        d["cautions"] = [f.to_dict() for f in self.cautions]
        d["exclusions"] = [f.to_dict() for f in self.exclusions]
        return d


# ---------------------------------------------------------------- 질병코드 정리

_CODE_PART = re.compile(r"^([A-Z])(\d{2})(?:\.(\d{1,2}))?$")


def _code_bounds(code: str) -> list[tuple[str, int, int]]:
    """'I60~I69' -> [('I',60,69)] / 'C73' -> [('C',73,73)]"""
    out = []
    for piece in code.replace(" ", "").split(","):
        if not piece:
            continue
        if "~" in piece:
            a, b = piece.split("~", 1)
            ma, mb = _CODE_PART.match(a), _CODE_PART.match(b if b[:1].isalpha() else a[:1] + b)
            if ma and mb:
                out.append((ma.group(1), int(ma.group(2)), int(mb.group(2))))
            continue
        m = _CODE_PART.match(piece)
        if m:
            out.append((m.group(1), int(m.group(2)), int(m.group(2))))
    return out


def compress_codes(codes: list[str]) -> list[str]:
    """연속된 코드는 범위로 묶어 보기 좋게 만든다. ['I60','I61',...] -> ['I60~I69']"""
    bounds: list[tuple[str, int, int]] = []
    for c in codes:
        bounds.extend(_code_bounds(c))
    if not bounds:
        return []
    bounds.sort()
    merged: list[list] = []
    for letter, lo, hi in bounds:
        if merged and merged[-1][0] == letter and lo <= merged[-1][2] + 1:
            merged[-1][2] = max(merged[-1][2], hi)
        else:
            merged.append([letter, lo, hi])
    out = []
    for letter, lo, hi in merged:
        out.append(f"{letter}{lo:02d}" if lo == hi else f"{letter}{lo:02d}~{letter}{hi:02d}")
    return out


def code_range_meaning(rng: str) -> str:
    return glossary().get("코드군", {}).get(rng, "")


def build_code_tables(section: SectionData, limit_items: int = 400) -> list[dict]:
    tables = []
    for tbl in section.tables:
        groups: dict[str, list[dict]] = {}
        for c in tbl["codes"][:limit_items]:
            grp = c["grp"] or "대상 질병"
            groups.setdefault(grp, []).append({
                "label": c["label"],
                "code": c["code"],
                "plain": plain_disease(c["label"]),
            })
        group_list = []
        for grp, items in groups.items():
            ranges = compress_codes([i["code"] for i in items])
            group_list.append({
                "group": grp,
                "items": items,
                "ranges": [{"code": r, "meaning": code_range_meaning(r)} for r in ranges],
            })
        all_ranges = compress_codes([c["code"] for c in tbl["codes"]])
        tables.append({
            "name": tbl["name"],
            "groups": group_list,
            "ranges": [{"code": r, "meaning": code_range_meaning(r)} for r in all_ranges],
            "count": len(tbl["codes"]),
        })
    return tables


# ---------------------------------------------------------------- 규칙

def _src(article: dict) -> str:
    return f"제{article['no']}조({normalize_space(article['title'])})"


def _body(article: dict) -> str:
    return compact(article["body"])


_TYPE_RULES = [
    ("진단", ("진단",)),
    ("입원", ("입원",)),
    ("수술", ("수술",)),
    ("통원", ("통원", "외래")),
    ("검사", ("검사", "조영술", "초음파", "ct")),
    ("치료", ("치료", "항암", "약물", "방사선")),
    ("간병", ("간병",)),
    ("요양", ("요양", "장기요양")),
    ("골절", ("골절",)),
    ("화상", ("화상",)),
    ("응급실", ("응급실",)),
    ("납입면제", ("납입면제", "보험료납입면제")),
    ("사망", ("사망", "종신", "유족")),
]


def guess_type(name: str, section: SectionData | None = None) -> str:
    c = compact(name).lower()
    for label, keys in _TYPE_RULES:
        if any(k in c for k in keys):
            return label
    if section:
        pay = section.article("보험금의", "지급사유")
        if pay:
            b = _body(pay)
            for label, keys in _TYPE_RULES:
                if any(k in b for k in keys):
                    return label
    return "보장"


def _looks_meaningful(text: str) -> bool:
    """목차 조각(예: ". 50") 같은 쓸모없는 문장을 걸러낸다."""
    t = compact(text or "")
    if len(t) < 12:
        return False
    hangul = sum(1 for ch in t if "가" <= ch <= "힣")
    return hangul >= max(6, len(t) * 0.3)


_QUOTED = re.compile(r"[“\"']\s*([가-힣A-Za-z0-9][^”\"'\n]{0,39})\s*[”\"']")


def covered_terms(section: SectionData) -> list[str]:
    """정의 조문 제목에서 이 특약이 보장하는 핵심 용어를 뽑는다."""
    terms: list[str] = []
    for art in section.articles:
        title = normalize_space(art["title"])
        if "정의" not in title:
            continue
        for m in _QUOTED.finditer(title):
            t = normalize_space(m.group(1))
            if t and t not in terms and "정의" not in t:
                terms.append(t)
    if not terms:
        pay = section.article("보험금의", "지급사유")
        if pay:
            for m in list(_QUOTED.finditer(pay["body"]))[:3]:
                t = normalize_space(m.group(1))
                if t and t not in terms:
                    terms.append(t)
    return terms[:4]


_GENERIC_TERMS = ("수술", "입원", "진단", "치료", "통원", "검사", "보험금", "재해")


def make_headline(name: str, type_label: str, terms: list[str], section: SectionData) -> str:
    subject = next((t for t in terms if compact(t) not in _GENERIC_TERMS), "")
    tmpl = glossary().get("특약유형", {}).get(type_label, "")
    if subject and type_label == "진단":
        return f"‘{subject}’으로 진단이 확정되면 약속한 진단보험금을 한 번에 드립니다."
    if subject and type_label == "입원":
        return f"‘{subject}’ 때문에 입원하면 입원한 날짜만큼 보험금을 드립니다."
    if subject and type_label == "수술":
        return f"‘{subject}’ 때문에 수술을 받으면 수술할 때마다 보험금을 드립니다."
    if subject and type_label in ("검사", "치료", "통원"):
        return f"‘{subject}’ 관련 {type_label}를 받으면 보험금을 드립니다."
    if tmpl:
        return tmpl
    pay = section.article("보험금의", "지급사유")
    if pay:
        first = shorten(join_lines(pay["body"]).split("\n")[0], 120)
        if _looks_meaningful(first):
            return first
    if section.kind == "주계약":
        return "이 상품의 기본 보장(주계약)입니다. 아래 지급사유와 주의사항을 확인해 주세요."
    return "약관에서 정한 사유가 생기면 약속한 보험금을 드립니다."


def definition_summary(section: SectionData, terms: list[str]) -> tuple[str, str]:
    """'○○'의 정의 조문을 한두 문장으로 요약."""
    art = None
    for a in section.articles:
        if "정의" in compact(a["title"]) and "진단확정" in compact(a["title"]):
            art = a
            break
    if art is None:
        for a in section.articles:
            if "정의" in compact(a["title"]) and "용어의정의" not in compact(a["title"]):
                art = a
                break
    if art is None:
        return "", ""
    body = join_lines(art["body"])
    first = re.split(r"(?<=니다\.)", body)
    text = normalize_space(first[0] if first else body)
    return shorten(text, 400), _src(art)


# ------------------------------------------------- 주의사항(꼭 확인할 점) 규칙

# 고객이 먼저 알아야 하는 순서
_PRIORITY = {
    "면책기간": 1, "면책예외": 2, "감액": 3, "대상제외": 4, "정의제외": 5,
    "CDR": 6, "지속기간": 7, "산정특례": 8, "진단기초": 9, "최초1회": 10,
    "연간한도": 11, "입원한도": 12, "재입원": 13, "수술회당": 14,
    "갱신": 20, "갱신한도": 21, "납입면제": 30,
}


def _rule_hits(section: SectionData) -> list[Fact]:
    facts: list[Fact] = []
    seen: set[str] = set()
    kinds: set[str] = set()

    def add(text: str, src: str, kind: str = "", tag: str = "") -> None:
        """같은 종류(kind)의 주의사항은 한 번만 담는다."""
        t = normalize_space(text)
        if not t or t in seen or (kind and kind in kinds):
            return
        seen.add(t)
        if kind:
            kinds.add(kind)
        facts.append(Fact(t, src, _PRIORITY.get(kind, 50), kind, normalize_space(tag)))

    for art in section.articles:
        b = _body(art)                                   # 공백 없는 본문(숫자 규칙용)
        bs = normalize_space(join_lines(art["body"]))    # 띄어쓰기 살린 본문(문구 인용용)
        src = _src(art)
        if not b:
            continue

        m = re.search(r"보장개시일은[^。]{0,20}?계약일[^。]{0,45}?(\d+)\s*(년|일)이\s*(?:지난|되는)날의다음날", b)
        if m:
            unit = "일" if m.group(2) == "일" else "년"
            add(f"이 보장은 가입일(계약일)을 포함해 {m.group(1)}{unit}이 지난 다음날부터 시작됩니다"
                f"(그 전에 해당 진단을 받으면 이 보장은 받을 수 없습니다).", src, "면책기간", f"가입 {m.group(1)}{unit} 후부터 보장")
            if re.search(r"다만,?재해로인한", b):
                add("다만 재해(사고)로 생긴 경우에는 위 기다리는 기간 없이 계약일부터 보장합니다.",
                    src, "면책예외", "재해는 기다리는 기간 없음")

        m = re.search(r"CDR척도[^。]{0,80}?검사결과가?(\d)점이상", b)
        if m:
            add(f"치매는 CDR(임상치매척도) 검사 결과가 {m.group(1)}점 이상이어야 보장 대상이 됩니다. "
                f"진단서·검사지에 CDR 점수가 반드시 기재되어야 합니다.", src, "CDR", f"CDR {m.group(1)}점 이상")

        m = re.search(r"발생시점으로부터(\d+)일이상계속", b)
        if m:
            add(f"그 상태가 {m.group(1)}일 이상 계속되고 더 이상 좋아지기 어렵다고 판단되어야 "
                f"보험금 지급 대상이 됩니다.", src, "지속기간", f"{m.group(1)}일 이상 지속")

        for m in re.finditer(r"(?:계약일|보험계약일)부터(\d+)년미만[^。]{0,60}?(\d{1,3})%", b):
            add(f"가입 후 {m.group(1)}년 안에 해당 사유가 생기면 보험금의 {m.group(2)}%만 지급됩니다"
                f"(감액지급).", src, "감액", f"{m.group(1)}년 내 {m.group(2)}%만 지급")
        for m in re.finditer(r"(\d+)년미만인경우에는(\d{1,3})%감액", b):
            add(f"가입 후 {m.group(1)}년 안에 해당되면 보험금의 {m.group(2)}%가 깎여 지급됩니다.", src, "감액", f"{m.group(1)}년 내 {m.group(2)}%만 지급")

        if re.search(r"최초1회의진단(확정)?에한", b):
            add("이 보장은 최초 1회 진단에 대해서만 지급되고, 지급 후에는 해당 보장이 끝납니다.", src, "최초1회", "최초 1회 한")

        m = re.search(r"연간(\d+)회에?한", b)
        if m:
            add(f"1년에 최대 {m.group(1)}회까지만 지급됩니다(계약해당일 기준 1년 단위).", src, "연간한도", f"연 {m.group(1)}회 한도")

        m = re.search(r"1회입원당(\d+)일", b)
        if m:
            add(f"입원보험금은 한 번 입원할 때 최대 {m.group(1)}일까지 지급됩니다.", src, "입원한도", f"1회 입원 {m.group(1)}일 한도")

        m = re.search(r"(\d+)일이지난후개시한입원은새로운입원", b)
        if m:
            add(f"보험금이 지급된 마지막 입원의 퇴원일부터 {m.group(1)}일이 지난 뒤 다시 입원하면 "
                f"새로운 입원으로 보아 한도가 다시 살아납니다.", src, "재입원", f"퇴원 {m.group(1)}일 후 재입원은 새 입원")

        if re.search(r"수술1회당", b):
            add("수술보험금은 수술 1회마다 지급됩니다(같은 날 여러 수술은 약관 기준에 따릅니다).", src, "수술회당", "수술 1회당 지급")

        m = re.search(r"장해지급률을더하여(\d{1,3})%이상", b)
        if m:
            add(f"장해지급률을 합해 {m.group(1)}% 이상인 장해상태가 되면 이후 보험료 납입이 면제됩니다.", src, "납입면제", f"장해 {m.group(1)}% 이상 시 납입면제")

        if "갱신" in compact(art["title"]):
            mm = re.search(r"보험기간은(\d+)년만기갱신", b)
            if mm:
                add(f"{mm.group(1)}년마다 자동 갱신되는 보장입니다. 갱신할 때의 나이와 위험률로 "
                    f"보험료가 다시 계산되므로 보험료가 오를 수 있습니다.", src, "갱신", f"{mm.group(1)}년마다 갱신(보험료 변동)")
            mm = re.search(r"(\d{2,3})세계약해당일", b)
            if mm:
                add(f"갱신은 최대 {mm.group(1)}세 계약해당일까지 가능합니다.", src, "갱신한도", f"최대 {mm.group(1)}세까지 갱신")

        excluded = re.search(
            r"다만,?\s*(.{5,90}?)\s*(?:으로|로)?\s*분류되는\s*경우에는\s*보장하지\s*않습니다", bs) \
            or re.search(r"다만,?\s*(.{5,90}?)\s*[은는이가]?\s*보장하지\s*않습니다", bs)
        if excluded:
            add(f"다만 {normalize_space(excluded.group(1))}은(는) 이 특약에서 보장하지 않습니다.",
                src, "정의제외", "일부 질병 제외")

        m = re.search(r"분류표\s*\(((?:[^()]|\([^()]*\))*?)\s*제외\s*\)", bs)
        if m:
            add(f"이 특약이 말하는 대상 질병에서 {normalize_space(m.group(1))}은(는) 제외됩니다. "
                f"해당 진단을 받으면 다른 특약(예: 소액암·유사암 보장)에서 보장되는지 확인이 필요합니다.",
                src, "대상제외", "유사암 등 제외")

        if re.search(r"산정특례(대상자로)?등록", b):
            add("건강보험 산정특례 등록(또는 등록 기준 충족)이 지급 조건에 포함됩니다. "
                "진단만으로는 부족할 수 있으니 등록 여부를 꼭 확인하세요.", src, "산정특례", "산정특례 등록 필요")

        if re.search(r"(90|180)일이상(계속하여)?(진단|치료)", b):
            mm = re.search(r"(\d+)일이상", b)
            if mm:
                add(f"해당 상태가 {mm.group(1)}일 이상 계속되어야 보험금 지급 대상이 됩니다.", src, "지속기간")

    return facts


def diagnosis_basis(section: SectionData) -> Fact | None:
    """진단이 어떤 검사에 근거해야 하는지."""
    for art in section.articles:
        b = _body(art)
        if "진단확정" not in compact(art["title"]) and "진단확정" not in b:
            continue
        exams = []
        for kw, label in [("전산화단층촬영", "CT"), ("brainct", "뇌CT"), ("자기공명영상", "MRI"),
                          ("뇌혈관조영술", "뇌혈관조영술"), ("양전자방출단층", "PET"),
                          ("단일광자방출", "SPECT"), ("뇌척수액검사", "뇌척수액검사"),
                          ("조직검사", "조직검사"), ("미세바늘흡인검사", "미세바늘흡인검사"),
                          ("혈액검사", "혈액검사"), ("심전도", "심전도"), ("심장초음파", "심장초음파"),
                          ("혈액종양표지자", "종양표지자검사")]:
            if kw in b.lower() and label not in exams:
                exams.append(label)
        if exams:
            return Fact(
                "진단은 병원 의사가 " + "·".join(exams) + " 등의 검사 결과와 진료기록을 근거로 "
                "내려야 인정됩니다. 진단서에 질병분류코드가 정확히 적혀 있어야 합니다.",
                _src(art), _PRIORITY["진단기초"])
    return None


def exclusions_of(section: SectionData) -> list[Fact]:
    art = section.article("보험금을", "지급하지")
    if not art:
        return []
    out: list[Fact] = []
    body = join_lines(art["body"])
    for line in re.split(r"\n|(?<=니다\.)\s*", body):
        line = normalize_space(line)
        if not line or len(line) < 6:
            continue
        m = re.match(r"^\d+\.\s*(.+)$", line)
        text = m.group(1) if m else line
        if any(k in compact(text) for k in ("고의로자신을해친", "고의로피보험자를해친",
                                            "고의로피보험자", "전쟁", "폭동", "직업",
                                            "위험한", "면제하지않습니다")):
            out.append(Fact(shorten(text, 160), _src(art)))
    if not out:
        out.append(Fact("고의 사고 등 약관에서 정한 사유에 해당하면 보험금이 지급되지 않습니다.",
                        _src(art)))
    return out[:5]


def documents_of(section: SectionData) -> list[str]:
    art = section.article("보험금", "청구")
    docs = ["청구서(회사 양식)", "사고증명서(진단서·입퇴원확인서 등, 병원 발급)", "신분증"]
    if art:
        b = _body(art)
        found = []
        for kw, label in [("진단서", "진단서(병명·질병분류코드 기재)"),
                          ("입", "입·퇴원확인서"), ("수술확인서", "수술확인서"),
                          ("장해진단서", "장해진단서"), ("진료기록부", "진료기록부(검사기록 포함)"),
                          ("사망진단서", "사망진단서"), ("통원확인서", "통원확인서")]:
            if kw in b and label not in found:
                found.append(label)
        if found:
            docs = ["청구서(회사 양식)"] + found + ["신분증"]
    return docs


def payouts_of(section: SectionData) -> list[Fact]:
    art = section.article("보험금의", "지급사유")
    if not art:
        return []
    body = join_lines(art["body"])
    out: list[Fact] = []
    items = re.split(r"\n(?=\d+\.\s)", body)
    if len(items) > 1:
        for it in items:
            t = normalize_space(it)
            if len(t) < 8:
                continue
            t = re.sub(r"^\d+\.\s*", "", t)
            if _looks_meaningful(t):
                out.append(Fact(shorten(t, 300), _src(art)))
    else:
        for t in re.split(r"(?<=니다\.)\s*", body):
            t = normalize_space(t)
            if not _looks_meaningful(t):
                continue
            out.append(Fact(shorten(t, 300), _src(art)))
    return out[:6]


# ---------------------------------------------------------------- 표 안 메모

_GROUP_BY_TYPE = {
    "진단": "진단", "입원": "입원", "수술": "수술", "통원": "통원", "검사": "검사",
    "치료": "치료", "간병": "간병", "요양": "요양", "골절": "재해", "화상": "재해",
    "응급실": "통원", "사망": "사망", "납입면제": "보험료 면제",
}


def make_pay_basis(note: "RiderNote", tags: list[str]) -> str:
    """'얼마를, 몇 번' 을 한 줄로. 가입금액이 있으면 금액을 그대로 쓴다."""
    amount = note.amount.strip()
    money = amount if amount else "약정한 보험금"
    limits = [t for t in tags if any(k in t for k in ("한도", "1회", "회당", "지속"))]
    tail = (" · " + " · ".join(dict.fromkeys(limits))) if limits else ""
    t = note.type_label
    if t == "진단":
        return f"진단 확정 시 {money}{tail}"
    if t == "입원":
        return f"입원 1일당 정해진 보험금 지급(가입금액 {money} 기준){tail}"
    if t == "수술":
        return f"수술 1회마다 정해진 보험금 지급(가입금액 {money} 기준){tail}"
    if t in ("통원", "검사", "치료"):
        return f"해당 {t}를 받으면 정해진 보험금 지급(가입금액 {money} 기준){tail}"
    if t == "납입면제":
        return "정해진 사유가 생기면 이후 보험료를 내지 않아도 보장 유지"
    if t == "사망":
        return f"사망 시 {money} 지급"
    return f"약관에서 정한 사유 발생 시 {money} 지급{tail}"


def fill_table_memo(note: "RiderNote") -> None:
    """제안서 표 안에 넣을 요약(구분·보장코드·지급기준·주의 태그)을 채운다."""
    note.group_label = _GROUP_BY_TYPE.get(note.type_label, "기타")
    codes: list[str] = []
    total = 0
    for tbl in note.code_tables:
        total += tbl.get("count", 0)
        for r in tbl.get("ranges", []):
            if r["code"] not in codes:
                codes.append(r["code"])
    note.code_summary = codes[:8]
    note.code_total = total
    tags = [f.tag for f in note.cautions if f.tag]
    # 갱신 주기는 제안서에 적힌 값(예: 5년갱신)이 이 계약의 실제 조건이므로 우선한다.
    m = re.search(r"(\d+)\s*년\s*갱신", note.period or "")
    if m:
        tags = [t for t in tags if "갱신" not in t or "세까지" in t]
        tags.insert(0, f"{m.group(1)}년마다 갱신(보험료 변동)")
    note.key_rules = list(dict.fromkeys(tags))[:5]
    note.pay_basis = make_pay_basis(note, tags)


# ---------------------------------------------------------------- 조립

def build_note(store: TermsStore, item: dict, product_hint: str | None = None,
               max_alternatives: int = 4) -> RiderNote:
    """제안서에서 읽은 특약 1건 -> 고객용 설명 노트."""
    name = item.get("name", "").strip()
    note = RiderNote(input_name=name, amount=item.get("amount", ""),
                     premium=item.get("premium", ""), period=item.get("period", ""),
                     note=item.get("note", ""))

    section_id = item.get("section_id")
    matches = store.search(name, product=product_hint, limit=max_alternatives + 1) if name else []
    if name and (not matches or matches[0].score < 0.72):
        # 해당 상품 약관에서 잘 맞는 특약이 없으면 전체 상품에서 다시 찾는다.
        wider = store.search(name, limit=max_alternatives + 1)
        merged = {m.section_id: m for m in wider}
        merged.update({m.section_id: m for m in matches})
        matches = sorted(merged.values(), key=lambda m: -m.score)[:max_alternatives + 1]
    if not section_id:
        if not matches:
            note.unmatched = True
            note.headline = "약관에서 같은 이름의 특약을 찾지 못했습니다. 이름을 확인하거나 직접 골라 주세요."
            return note
        best = matches[0]
        section_id = best.section_id
        note.confidence, note.match_reason = best.score, best.reason
    note.alternatives = [{"section_id": m.section_id, "name": m.name, "product": m.product,
                          "score": m.score} for m in matches if m.section_id != section_id][:max_alternatives]

    section = store.section(int(section_id))
    note.section_id = section.id
    note.matched_name = section.name
    note.product = section.product
    note.source_label = section.source_label
    note.covered_terms = covered_terms(section)
    note.type_label = guess_type(section.name or name, section)
    note.headline = make_headline(section.name or name, note.type_label, note.covered_terms, section)
    note.definition, note.definition_source = definition_summary(section, note.covered_terms)
    note.code_tables = build_code_tables(section)
    note.payouts = payouts_of(section)
    cautions = _rule_hits(section)
    basis = diagnosis_basis(section)
    if basis:
        cautions.append(basis)
    cautions = [f for i, f in sorted(enumerate(cautions), key=lambda x: (x[1].priority, x[0]))]
    note.cautions = cautions[:10]
    note.exclusions = exclusions_of(section)
    note.documents = documents_of(section)
    fill_table_memo(note)
    return note
