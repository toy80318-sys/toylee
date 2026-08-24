"""약관 색인 -> 옵시디언(Obsidian) 노트.

특약마다 노트 한 장을 만들고, 상품·질병분류코드와 `[[링크]]` 로 이어 준다.
옵시디언에서 'I60~I69' 노트를 열면 그 코드를 보장하는 특약이 백링크로 모두 보인다.

노트 아래쪽 '내 메모' 칸에 적은 내용은 다시 내보내도 지우지 않는다.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

from .explain import RiderNote, build_note
from .store import TermsStore

FOLDER = "보험약관"                 # 보관함(vault) 안에 만들 폴더
MEMO_MARK = "## 내 메모"           # 이 줄 아래는 사용자 것 - 덮어쓰지 않는다
_BAD = re.compile(r'[\\/:*?"<>|#^\[\]]')      # 파일명·링크에 쓸 수 없는 글자


def safe_title(name: str) -> str:
    """파일 이름과 [[링크]] 에 쓸 수 있게 다듬는다."""
    title = _BAD.sub(" ", name or "").strip()
    title = re.sub(r"\s{2,}", " ", title).strip(" .")
    return title[:80] or "이름없음"


def link(name: str) -> str:
    return f"[[{safe_title(name)}]]"


def _yaml(value: str) -> str:
    return '"' + str(value).replace('"', "'") + '"'


def keep_memo(path: Path) -> str:
    """이미 있는 노트에서 '내 메모' 부분만 가져온다."""
    if not path.exists():
        return ""
    try:
        old = path.read_text(encoding="utf-8")
    except OSError:
        return ""
    idx = old.find(MEMO_MARK)
    if idx < 0:
        return ""
    return old[idx + len(MEMO_MARK):].strip("\n")


def unique_titles(rows: list[dict]) -> dict[int, str]:
    """노트 제목을 정한다.

    같은 이름의 특약이 여러 상품에 있으면(예: 무배당 암진단특약L) 파일이 서로
    덮어써지므로, 겹치는 이름에만 상품명을 덧붙여 구분한다.
    """
    counts: dict[str, int] = {}
    for row in rows:
        counts[safe_title(row["name"])] = counts.get(safe_title(row["name"]), 0) + 1
    titles: dict[int, str] = {}
    used: set[str] = set()
    for row in rows:
        base = safe_title(row["name"])
        title = base if counts[base] == 1 else safe_title(f"{base} ({row['product']})")
        if title in used:                    # 같은 상품 안에서도 이름이 겹칠 때
            n = 2
            while f"{title} {n}" in used:
                n += 1
            title = f"{title} {n}"
        used.add(title)
        titles[row["id"]] = title
    return titles


def rider_markdown(note: RiderNote, title: str = "") -> str:
    """특약 노트 한 장."""
    title = title or safe_title(note.matched_name or note.input_name)
    tags = ["보험약관"] + ([note.group_label] if note.group_label else [])
    out = [
        "---",
        "분류: 특약",
        f"상품: {_yaml(note.product)}",
        f"구분: {_yaml(note.group_label or note.type_label)}",
        f"출처: {_yaml(note.source_label)}",
        "태그: [" + ", ".join(tags) + "]",
        "---",
        "",
        f"# {title}",
        "",
    ]
    if note.headline:
        out += [f"> {note.headline}", ""]
    head = [f"**상품** {link(note.product)}" if note.product else ""]
    if note.group_label:
        head.append(f"**구분** {note.group_label}")
    if note.pay_basis:
        head.append(f"**지급 기준** {note.pay_basis}")
    out += [" · ".join(h for h in head if h), ""]

    if note.code_tables:
        out += ["## 어떤 병이 대상인가", ""]
        for table in note.code_tables:
            if table.get("name"):
                out += [f"**{table['name']}** (총 {table.get('count', 0)}개 항목)", ""]
            ranges = [r["code"] for r in table.get("ranges", [])]
            if ranges:
                out += ["보장 코드 " + " · ".join(link(code) for code in ranges), ""]
            rows = [(g.get("group", ""), item)
                    for g in table.get("groups", []) for item in g.get("items", [])]
            if rows:
                out += ["| 질병 | 코드 | 쉬운 설명 |", "|---|---|---|"]
                for group, item in rows[:40]:
                    label = item.get("label", "")
                    if group and group not in label:
                        label = f"{group} · {label}"
                    out.append(f"| {label} | `{item.get('code', '')}` | {item.get('plain', '')} |")
                if len(rows) > 40:
                    out += ["", f"… 외 {len(rows) - 40}개 항목(약관 원문 참고)"]
            out.append("")

    if note.definition:
        out += ["## 약관이 말하는 뜻", "", note.definition,
                f"\n<sub>{note.definition_source}</sub>" if note.definition_source else "", ""]

    def facts(header: str, items) -> None:
        if not items:
            return
        out.append(header)
        out.append("")
        for fact in items:
            source = f" <sub>({fact.source})</sub>" if getattr(fact, "source", "") else ""
            out.append(f"- {fact.text}{source}")
        out.append("")

    facts("## 언제 보험금이 나오나", note.payouts)
    facts("## 꼭 확인할 점", note.cautions)
    facts("## 안 나오는 경우", note.exclusions)

    if note.documents:
        out += ["## 청구 서류", ""] + [f"- {d}" for d in note.documents] + [""]

    out += ["## 근거", "", f"- 약관: {note.source_label}", ""]
    out += [MEMO_MARK, ""]
    return "\n".join(out).replace("\n\n\n", "\n\n").rstrip() + "\n"


def product_markdown(product: str, riders: list[str]) -> str:
    out = ["---", "분류: 상품", "태그: [보험약관, 상품]", "---", "",
           f"# {safe_title(product)}", "",
           f"특약 {len(riders)}건입니다. 이름을 누르면 보장 내용이 열립니다.", ""]
    for name in sorted(riders):
        out.append(f"- {link(name)}")
    out += ["", MEMO_MARK, ""]
    return "\n".join(out)


def code_markdown(code: str, plain: str = "") -> str:
    out = ["---", "분류: 질병분류코드", "태그: [보험약관, 질병코드]", "---", "",
           f"# {safe_title(code)}", ""]
    if plain:
        out += [plain, ""]
    out += ["이 코드를 보장하는 특약은 아래 **연결된 문서(백링크)** 에서 볼 수 있습니다.",
            "", MEMO_MARK, ""]
    return "\n".join(out)


def index_markdown(by_product: dict[str, list[str]]) -> str:
    total = sum(len(v) for v in by_product.values())
    out = ["---", "분류: 색인", "태그: [보험약관]", "---", "",
           "# 약관 색인", "",
           f"상품 {len(by_product)}개 · 특약 {total}건", "",
           "| 상품 | 특약 수 |", "|---|---|"]
    for product, riders in sorted(by_product.items()):
        out.append(f"| {link(product)} | {len(riders)} |")
    out += ["", MEMO_MARK, ""]
    return "\n".join(out)


def code_index_markdown(codes: dict[str, str]) -> str:
    """질병분류코드 한눈에 보기(테블릿에서 상담 중 빠르게 찾기 위한 목록)."""
    out = ["---", "분류: 색인", "태그: [보험약관, 질병코드]", "---", "",
           "# 질병코드 찾아보기", "",
           "고객이 말한 병명·코드로 여기서 찾은 뒤, 그 코드 노트를 열면",
           "**보장하는 특약이 아래 연결된 문서에 모두** 나옵니다.", "",
           "| 코드 | 어떤 병인가 |", "|---|---|"]
    for code in sorted(codes):
        out.append(f"| {link(code)} | {codes[code]} |")
    out += ["", MEMO_MARK, ""]
    return "\n".join(out)


def customer_markdown(doc: dict, titles: dict[int, str] | None = None) -> str:
    """고객 한 명의 보장분석을 노트 한 장으로.

    titles 는 {약관구간 id: 노트 제목}. 특약 노트가 '이름 (상품)' 으로 저장된
    경우에도 링크가 깨지지 않게, 실제 파일 제목으로 연결한다.
    """
    titles = titles or {}
    customer = doc.get("customer", {})
    name = customer.get("name") or "고객"
    created = doc.get("created_at", "")
    notes = doc.get("notes", [])

    out = ["---", "분류: 고객보장분석",
           f"고객: {_yaml(name)}",
           f"작성일: {created}",
           f"상품: {_yaml(doc.get('product', ''))}",
           "태그: [보장분석]", "---", "",
           f"# {safe_title(name)} 님 보장분석 ({created})", ""]

    info = [f"**생년월일** {customer.get('birth')}" if customer.get("birth") else "",
            f"**성별** {customer.get('gender')}" if customer.get("gender") else "",
            f"**연락처** {customer.get('phone')}" if customer.get("phone") else ""]
    info = [i for i in info if i]
    if info:
        out += [" · ".join(info), ""]
    if customer.get("memo"):
        out += [f"> {customer['memo']}", ""]

    total = doc.get("summary", {}).get("total_premium", "")
    line_ = []
    if doc.get("product"):
        line_.append(f"**가입상품** {doc['product']}")
    if total:
        line_.append(f"**월 보험료 합계** {total}")
    if line_:
        out += [" · ".join(line_), ""]
    sources = doc.get("source_products") or []
    if sources:
        out += ["**근거 약관** " + " · ".join(link(p) for p in sources), ""]

    out += ["## 계약사항", "",
            "| 구분 | 보장(특약) | 가입금액 | 납입/보험기간 | 보험료 | 쉬운 설명 |",
            "|---|---|---|---|---|---|"]
    for note in notes:
        matched = note.get("matched_name") or note.get("input_name", "")
        shown = titles.get(note.get("section_id"), safe_title(matched))
        label = link(shown) if matched and not note.get("unmatched") else note.get("input_name", "")
        memo = [note.get("headline", "")]
        if note.get("code_summary"):
            memo.append("대상 코드 " + " · ".join(f"`{c}`" for c in note["code_summary"]))
        if note.get("pay_basis"):
            memo.append(note["pay_basis"])
        if note.get("key_rules"):
            memo.append(" ".join(f"`{r}`" for r in note["key_rules"]))
        if note.get("note"):
            memo.append(f"**메모** {note['note']}")
        out.append(f"| {note.get('group_label', '')} | {label} | {note.get('amount', '')} | "
                   f"{note.get('period', '')} | {note.get('premium', '')} | "
                   + "<br>".join(m for m in memo if m) + " |")

    summary = doc.get("summary", {})
    out += ["", f"특약 {summary.get('total', 0)}건 (약관 확인 {summary.get('matched', 0)}건"
            + (f" · 미확인 {summary['unmatched']}건" if summary.get("unmatched") else "") + ")", ""]

    planner = doc.get("planner", {})
    if any(planner.values()):
        out += ["## 담당 설계사", "",
                " · ".join(v for v in [planner.get("name"), planner.get("phone"),
                                       planner.get("org")] if v), ""]

    out += ["> 이 노트는 약관을 쉽게 풀어 쓴 **참고 자료**입니다. "
            "실제 보장 여부는 약관 원문과 회사 심사 기준에 따릅니다.", "",
            MEMO_MARK, ""]
    return "\n".join(out)


def export_customer(doc: dict, vault: Path, folder: str = FOLDER,
                    store: TermsStore | None = None) -> Path:
    """고객 보장분석 노트를 보관함에 저장하고 그 경로를 돌려준다."""
    vault = Path(vault)
    if not vault.exists():
        raise RuntimeError(f"옵시디언 보관함 폴더를 찾을 수 없습니다: {vault}")
    titles = unique_titles(store._all_sections()) if store is not None else {}
    name = doc.get("customer", {}).get("name") or "고객"
    created = doc.get("created_at", "")
    path = vault / folder / "고객" / f"{safe_title(name)} {created}.md"
    write_note(path, customer_markdown(doc, titles))
    return path


@dataclass
class ExportResult:
    riders: int = 0
    products: int = 0
    codes: int = 0
    skipped: int = 0
    folder: Path | None = None


def export(store: TermsStore, vault: Path, folder: str = FOLDER,
           product: str | None = None, progress=None) -> ExportResult:
    """약관 색인 전체를 옵시디언 노트로 내보낸다."""
    vault = Path(vault)
    if not vault.exists():
        raise RuntimeError(f"옵시디언 보관함 폴더를 찾을 수 없습니다: {vault}")

    base = vault / folder
    for sub in ("특약", "상품", "질병분류"):
        (base / sub).mkdir(parents=True, exist_ok=True)

    result = ExportResult(folder=base)
    by_product: dict[str, list[str]] = {}
    codes: dict[str, str] = {}

    # 제목은 늘 전체 목록을 기준으로 정한다. 한 상품만 내보낼 때 이름이 달라지면
    # 같은 특약의 노트가 두 벌 생겨 링크가 갈라진다.
    all_rows = store._all_sections()
    titles = unique_titles(all_rows)
    rows = [r for r in all_rows if not product or r["product"] == product]
    for i, row in enumerate(rows, 1):
        if progress:
            progress(i, len(rows), row["name"])
        note = build_note(store, {"name": row["name"], "section_id": row["id"]})
        if note.unmatched or not note.headline:
            result.skipped += 1
            continue
        title = titles[row["id"]]
        write_note(base / "특약" / f"{title}.md", rider_markdown(note, title))
        result.riders += 1
        by_product.setdefault(note.product, []).append(title)
        for table in note.code_tables:
            for rng in table.get("ranges", []):
                codes.setdefault(rng["code"], rng.get("meaning", ""))

    for name, riders in by_product.items():
        write_note(base / "상품" / f"{safe_title(name)}.md",
                   product_markdown(name, riders))
    result.products = len(by_product)

    for code, plain in codes.items():
        write_note(base / "질병분류" / f"{safe_title(code)}.md", code_markdown(code, plain))
    result.codes = len(codes)

    write_note(base / "00 약관 색인.md", index_markdown(by_product))
    write_note(base / "01 질병코드 찾아보기.md", code_index_markdown(codes))
    return result


def write_note(path: Path, body: str) -> None:
    """노트를 저장하되, 사용자가 '내 메모' 에 적은 내용은 그대로 살린다."""
    memo = keep_memo(path)
    if memo:
        body = body.rstrip() + "\n" + memo + "\n"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(body, encoding="utf-8")
