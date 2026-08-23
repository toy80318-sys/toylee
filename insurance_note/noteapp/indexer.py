"""약관 PDF 를 읽어 특약 단위로 쪼개고 SQLite 색인을 만든다.

한 번만 실행해 두면(build_index.py) 이후 제안서 분석은 이 색인만 사용한다.
"""
from __future__ import annotations

import re
import sqlite3
import time
from dataclasses import dataclass, field
from pathlib import Path

import pymupdf

from . import config
from .textutil import compact, key as name_key, normalize_space

# ---------------------------------------------------------------- 파일 묶기

_TRAILING_NUM = re.compile(r"[\s_-]*(\d+)\s*$")


def product_group(path: Path) -> tuple[str, int]:
    """파일명에서 상품명과 순번을 뽑는다. (마이플랜3.pdf -> ("마이플랜", 3))"""
    stem = path.stem.strip()
    m = _TRAILING_NUM.search(stem)
    if m:
        return stem[: m.start()].strip(), int(m.group(1))
    return stem, 0


def is_supplementary(path: Path) -> bool:
    """약관이 아닌 상품요약서·사업방법서 여부."""
    return any(k in path.stem for k in ("상품요약서", "사업방법서", "가입설계", "안내자료"))


def collect_products(terms_dir: Path) -> dict[str, list[Path]]:
    """상품별로 PDF 파일들을 순서대로 묶는다."""
    groups: dict[str, list[tuple[int, Path]]] = {}
    for path in sorted(terms_dir.glob("*.pdf")):
        name, seq = product_group(path)
        if is_supplementary(path):
            name = f"{name.split('(')[0].strip()} (참고자료)"
        groups.setdefault(name, []).append((seq, path))
    return {n: [p for _, p in sorted(v)] for n, v in sorted(groups.items())}


# ---------------------------------------------------------------- 페이지 읽기

@dataclass
class Page:
    file: str
    number: int          # 파일 안에서의 페이지 번호(1부터)
    text: str


def extract_text(page: "pymupdf.Page", gap_ratio: float = 0.22) -> str:
    """글자 좌표를 보고 띄어쓰기를 되살리며 텍스트를 뽑는다.

    이 약관 PDF 들은 공백 문자를 넣지 않고 좌표만으로 띄어쓰기를 표현한다.
    그래서 기본 추출을 쓰면 "이특약은보험계약자..." 처럼 붙어 나온다.
    글자 사이 간격이 글자 크기의 일정 비율보다 크면 공백을 넣어 준다.
    """
    lines: list[str] = []
    data = page.get_text("rawdict")
    for block in data.get("blocks", []):
        if block.get("type") != 0:
            continue
        for line in block.get("lines", []):
            buf = ""
            prev_x1 = None
            for span in line.get("spans", []):
                size = span.get("size", 10) or 10
                for ch in span.get("chars", []):
                    c = ch["c"]
                    x0, _, x1, _ = ch["bbox"]
                    if prev_x1 is not None and c != " " and not buf.endswith(" "):
                        if x0 - prev_x1 > gap_ratio * size:
                            buf += " "
                    buf += c
                    prev_x1 = x1
            if buf.strip():
                lines.append(buf.rstrip())
        lines.append("")
    return "\n".join(lines)


def read_pages(path: Path) -> list[Page]:
    doc = pymupdf.open(path)
    try:
        return [Page(path.name, i + 1, extract_text(doc[i])) for i in range(len(doc))]
    finally:
        doc.close()


# ---------------------------------------------------------------- 구간 나누기

_COVER_MARK = re.compile(r"^(약\s*관|보험\s*약관|보통\s*약관)$")
_ATTACH_HEAD = re.compile(r"^[（(]?\s*별표\s*\d*\s*[)）]?")


@dataclass
class Section:
    name: str
    kind: str                     # 주계약 / 특약 / 공통·안내
    file: str                     # 구간이 시작된 파일
    page_start: int
    page_end: int
    file_end: str = ""            # 구간이 끝난 파일(여러 파일에 걸칠 수 있음)
    pages: list[str] = field(default_factory=list)

    @property
    def text(self) -> str:
        return "\n".join(self.pages)


def _cover_name(text: str) -> str | None:
    """표지 페이지면 상품/특약 이름을 돌려준다."""
    lines = [l.strip() for l in text.split("\n") if l.strip()][:6]
    for i, line in enumerate(lines):
        if not _COVER_MARK.fullmatch(compact(line)) or i == 0:
            continue
        head = [l for l in lines[:i]
                if not re.search(r"(선택하여|적용합니다|가입한\s*경우|한하여|약관은)", l)]
        name = normalize_space(" ".join(head))
        if 2 <= len(compact(name)) <= 80:
            return name
        # 표지에 안내문만 있는 경우 "이 특약의 약관은 ○○을 선택하여" 에서 이름을 뽑는다.
        m = re.search(r"약관은\s*(.{2,60}?)\s*[을를]\s*선택", normalize_space(text))
        if m:
            return normalize_space(m.group(1))
    return None


def _kind_of(name: str) -> str:
    c = compact(name)
    if c.endswith("특약") or "특약" in c:
        return "특약"
    if not c:
        return "공통·안내"
    return "주계약"


def split_sections(pages: list[Page]) -> list[Section]:
    """표지 페이지를 기준으로 주계약/특약 구간을 나눈다."""
    sections: list[Section] = []
    current: Section | None = None
    for page in pages:
        cover = _cover_name(page.text)
        if cover:
            if current is not None and name_key(current.name) == name_key(cover):
                # 같은 이름의 표지가 연달아 나오는 경우(속표지)
                current.pages.append(page.text)
                current.page_end, current.file_end = page.number, page.file
                continue
            current = Section(name=normalize_space(cover), kind=_kind_of(cover),
                              file=page.file, page_start=page.number,
                              page_end=page.number, file_end=page.file,
                              pages=[page.text])
            sections.append(current)
            continue
        if current is None:
            current = Section(name="공통 안내·목차", kind="공통·안내", file=page.file,
                              page_start=page.number, page_end=page.number,
                              file_end=page.file, pages=[])
            sections.append(current)
        current.pages.append(page.text)
        current.page_end, current.file_end = page.number, page.file
    return sections


# ---------------------------------------------------------------- 조문 / 별표

_ARTICLE = re.compile(r"제\s*(\d+)\s*조\s*[（(]\s*([^)）\n]{1,70})\s*[)）]")
_CODE = re.compile(
    r"([A-Z]\d{2}(?:\.\d{1,2})?(?:\s*[~∼\-–]\s*[A-Z]?\d{2}(?:\.\d{1,2})?)?"
    r"(?:\s*,\s*[A-Z]?\d{2}(?:\.\d{1,2})?)*)\s*$")
_TABLE_HEAD = re.compile(r"[（(]?\s*별표\s*(\d+)?\s*[)）]?\s*\n?\s*[\"“']?([^\n\"”']{2,60})[\"”']?\s*(분류표|지급기준표|해당표)")


@dataclass
class Article:
    no: int
    title: str
    body: str


def parse_articles(text: str) -> list[Article]:
    """'제N조 (제목)' 단위로 조문을 자른다.

    본문 안의 인용(예: "제3조(의료기관)에서 규정한 …")까지 조문 제목으로
    잡히지 않도록, 줄 맨 앞에서 시작하면서 조 번호가 1씩 커지는 것만 인정한다.
    """
    marks = []
    for m in _ARTICLE.finditer(text):
        at_line_start = m.start() == 0 or text[m.start() - 1] in "\n\r"
        if at_line_start:
            marks.append(m)
    if not marks:
        return []

    chosen: list = []
    expected = None
    for m in marks:
        no = int(m.group(1))
        if expected is None:
            if no != 1 and chosen:
                continue
            chosen.append(m)
            expected = no + 1
            continue
        if no == expected:
            chosen.append(m)
            expected += 1
        elif no == 1 and len(chosen) > 3:
            # 같은 구간 안에서 다음 약관(예: 별첨 특약)이 새로 시작하는 경우
            chosen.append(m)
            expected = 2

    out: list[Article] = []
    for i, m in enumerate(chosen):
        end = chosen[i + 1].start() if i + 1 < len(chosen) else len(text)
        body = text[m.end():end].strip()
        if len(re.sub(r"\s+", "", body)) < 30:
            # 목차 줄("제3조(…) .120") 처럼 본문이 없는 항목은 조문으로 보지 않는다.
            continue
        out.append(Article(no=int(m.group(1)), title=normalize_space(m.group(2)), body=body))
    return out


@dataclass
class CodeTable:
    name: str
    body: str
    items: list[tuple[str, str, str]]   # (분류군, 분류항목, 분류코드)


def _is_code_only(line: str) -> bool:
    return bool(re.fullmatch(
        r"[A-Z]\d{2}(?:\.\d{1,2})?(?:\s*[~∼\-–]\s*[A-Z]?\d{2}(?:\.\d{1,2})?)?"
        r"(?:\s*,\s*[A-Z]?\d{2}(?:\.\d{1,2})?)*", line.strip()))


def _clean_code(code: str) -> str:
    return re.sub(r"\s+", "", code).replace("∼", "~").replace("–", "~").replace("-", "~")


def _looks_like_label(line: str) -> bool:
    if not line or len(line) > 40:
        return False
    if re.search(r"(합니다|입니다|말한다|다만|참조)", line):
        return False
    if re.search(r"[.。]$", line.strip()):
        return False
    return bool(re.search(r"[가-힣A-Za-z]", line))


def parse_code_tables(text: str) -> list[CodeTable]:
    """(별표) ○○분류표 안의 '분류항목 / 분류코드' 목록을 뽑는다.

    PDF 에 따라 항목과 코드가 한 줄에 같이 나오기도 하고(pypdf 형),
    항목·코드가 각각 다른 줄로 떨어지기도 한다(PyMuPDF 형). 둘 다 처리한다.
    """
    merged: dict[str, CodeTable] = {}
    chunks = re.split(r"(?=[（(]\s*별표\s*\d*\s*[)）])", text)
    for chunk in chunks:
        head = chunk[:400]
        if "분류표" not in head:
            continue
        m = re.search(r"[\"“']?([^\n\"”']{2,60}?)[\"”']?\s*분류표", head)
        title = (normalize_space(m.group(1)) + " 분류표") if m else "분류표"
        title = re.sub(r"^[\s)）]+|^별표\s*\d*\s*", "", title).strip()

        items: list[tuple[str, str, str]] = []
        group = ""
        pending: list[str] = []
        for raw in chunk.split("\n"):
            line = normalize_space(raw)
            if not line or line in ("분류항목", "분류코드", "분류항목 분류코드"):
                continue
            inline = _CODE.search(line)
            if inline and not _is_code_only(line):
                label = normalize_space(line[: inline.start()]).strip(" .·-")
                if _looks_like_label(label):
                    items.append((group, label, _clean_code(inline.group(1))))
                    pending.clear()
                continue
            if _is_code_only(line):
                if pending:
                    label = pending.pop()
                    if pending:
                        group = pending[-1]
                        pending.clear()
                    items.append((group, label, _clean_code(line)))
                continue
            if _looks_like_label(line):
                pending.append(line)
            else:
                pending.clear()

        if not items:
            continue
        tbl = merged.get(title)
        if tbl is None:
            merged[title] = CodeTable(name=title, body=chunk[:8000], items=items)
        else:
            have = {(g, l, c) for g, l, c in tbl.items}
            tbl.items.extend(it for it in items if it not in have)
    return list(merged.values())


# ---------------------------------------------------------------- 색인 저장

SCHEMA = """
PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS products(
    id INTEGER PRIMARY KEY, name TEXT UNIQUE, files TEXT, built_at TEXT);
CREATE TABLE IF NOT EXISTS sections(
    id INTEGER PRIMARY KEY, product_id INTEGER, name TEXT, name_key TEXT, kind TEXT,
    file TEXT, file_end TEXT, page_start INTEGER, page_end INTEGER, text TEXT);
CREATE TABLE IF NOT EXISTS articles(
    id INTEGER PRIMARY KEY, section_id INTEGER, no INTEGER, title TEXT, body TEXT);
CREATE TABLE IF NOT EXISTS code_tables(
    id INTEGER PRIMARY KEY, section_id INTEGER, name TEXT, body TEXT);
CREATE TABLE IF NOT EXISTS codes(
    id INTEGER PRIMARY KEY, table_id INTEGER, grp TEXT, label TEXT, code TEXT);
CREATE INDEX IF NOT EXISTS ix_sections_key ON sections(name_key);
CREATE INDEX IF NOT EXISTS ix_articles_section ON articles(section_id);
CREATE INDEX IF NOT EXISTS ix_tables_section ON code_tables(section_id);
CREATE INDEX IF NOT EXISTS ix_codes_table ON codes(table_id);
"""


def connect(db_path: Path | None = None) -> sqlite3.Connection:
    path = Path(db_path or config.INDEX_DB)
    path.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(path)
    con.row_factory = sqlite3.Row
    return con


def build(terms_dir: Path | None = None, db_path: Path | None = None,
          progress=lambda msg: None) -> dict:
    terms_dir = Path(terms_dir or config.TERMS_DIR)
    db_path = Path(db_path or config.INDEX_DB)
    if db_path.exists():
        db_path.unlink()
    con = connect(db_path)
    con.executescript(SCHEMA)
    stats = {"products": 0, "sections": 0, "articles": 0, "tables": 0, "codes": 0, "files": 0}
    started = time.time()

    for product, files in collect_products(terms_dir).items():
        pages: list[Page] = []
        for f in files:
            progress(f"  읽는 중: {f.name}")
            pages.extend(read_pages(f))
            stats["files"] += 1
        if not pages:
            continue
        cur = con.execute("INSERT INTO products(name, files, built_at) VALUES(?,?,datetime('now'))",
                          (product, ", ".join(f.name for f in files)))
        pid = cur.lastrowid
        stats["products"] += 1
        for sec in split_sections(pages):
            text = sec.text
            cur = con.execute(
                "INSERT INTO sections(product_id,name,name_key,kind,file,file_end,"
                "page_start,page_end,text) VALUES(?,?,?,?,?,?,?,?,?)",
                (pid, sec.name, name_key(sec.name), sec.kind, sec.file,
                 sec.file_end or sec.file, sec.page_start, sec.page_end, text))
            sid = cur.lastrowid
            stats["sections"] += 1
            for art in parse_articles(text):
                con.execute("INSERT INTO articles(section_id,no,title,body) VALUES(?,?,?,?)",
                            (sid, art.no, art.title, art.body))
                stats["articles"] += 1
            for tbl in parse_code_tables(text):
                cur = con.execute("INSERT INTO code_tables(section_id,name,body) VALUES(?,?,?)",
                                  (sid, tbl.name, tbl.body))
                tid = cur.lastrowid
                stats["tables"] += 1
                con.executemany("INSERT INTO codes(table_id,grp,label,code) VALUES(?,?,?,?)",
                                [(tid, g, l, c) for g, l, c in tbl.items])
                stats["codes"] += len(tbl.items)
        con.commit()
        progress(f"[{product}] 구간 {stats['sections']}건 누적")

    con.commit()
    con.close()
    stats["seconds"] = round(time.time() - started, 1)
    return stats
