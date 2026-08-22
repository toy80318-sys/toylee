"""색인(SQLite) 조회 계층 - 특약 검색과 조문·분류표 읽기."""
from __future__ import annotations

import difflib
import re
import sqlite3
import threading
from dataclasses import dataclass, field
from pathlib import Path

from . import config
from .indexer import connect
from .textutil import compact, core_key, key as name_key, tokens


@dataclass
class Match:
    section_id: int
    name: str
    product: str
    kind: str
    score: float
    reason: str


@dataclass
class SectionData:
    id: int
    name: str
    product: str
    kind: str
    file: str
    file_end: str
    page_start: int
    page_end: int
    text: str
    articles: list[dict] = field(default_factory=list)
    tables: list[dict] = field(default_factory=list)

    @property
    def source_label(self) -> str:
        if self.file_end and self.file_end != self.file:
            return f"{self.file} p.{self.page_start} ~ {self.file_end} p.{self.page_end}"
        return f"{self.file} p.{self.page_start}~{self.page_end}"

    def article(self, *keywords: str) -> dict | None:
        """제목에 keyword 가 모두 들어간 첫 조문."""
        for art in self.articles:
            t = compact(art["title"])
            if all(compact(k) in t for k in keywords):
                return art
        return None

    def articles_like(self, *keywords: str) -> list[dict]:
        out = []
        for art in self.articles:
            t = compact(art["title"])
            if any(compact(k) in t for k in keywords):
                out.append(art)
        return out


class TermsStore:
    def __init__(self, db_path: Path | None = None):
        self.db_path = Path(db_path or config.INDEX_DB)
        # SQLite 연결은 스레드마다 따로 갖는다(웹서버가 여러 스레드로 동작).
        self._local = threading.local()
        self._cache: list[dict] | None = None
        self._lock = threading.Lock()

    # ------------------------------------------------------------ 기본
    @property
    def ready(self) -> bool:
        return self.db_path.exists()

    @property
    def con(self) -> sqlite3.Connection:
        con = getattr(self._local, "con", None)
        if con is None:
            if not self.ready:
                raise FileNotFoundError(
                    f"색인 파일이 없습니다: {self.db_path}\n"
                    "먼저 'python3 build_index.py' 를 실행해 주세요.")
            con = connect(self.db_path)
            self._local.con = con
        return con

    def stats(self) -> dict:
        if not self.ready:
            return {}
        q = ("select (select count(*) from products) products,"
             " (select count(*) from sections) sections,"
             " (select count(*) from articles) articles,"
             " (select count(*) from codes) codes,"
             " (select max(built_at) from products) built_at")
        return dict(self.con.execute(q).fetchone())

    def products(self) -> list[str]:
        return [r[0] for r in self.con.execute("select name from products order by name")]

    def _all_sections(self) -> list[dict]:
        with self._lock:
            return self._load_sections()

    def _load_sections(self) -> list[dict]:
        if self._cache is None:
            rows = self.con.execute(
                "select s.id, s.name, s.name_key, s.kind, p.name product,"
                " (select count(*) from articles a where a.section_id = s.id) n_articles"
                " from sections s join products p on p.id = s.product_id").fetchall()
            self._cache = [dict(r) for r in rows]
            for r in self._cache:
                r["tokens"] = tokens(r["name"])
                r["core"] = core_key(r["name"])
        return self._cache

    # ------------------------------------------------------------ 검색
    def search(self, query: str, product: str | None = None, limit: int = 8) -> list[Match]:
        """특약명(제안서에서 읽은 이름)으로 약관 구간을 찾는다."""
        qk = name_key(query)
        qc = core_key(query)
        qt = tokens(query)
        if not qk:
            # '주계약' 처럼 이름이 통째로 비워지는 경우: 해당 상품의 주계약을 돌려준다.
            if compact(query) in ("주계약", "주보험", "기본계약", "보통약관"):
                rows = [r for r in self._all_sections() if r["kind"] == "주계약"
                        and (not product or r["product"] == product)]
                # 표지·목차만 있는 구간이 아니라 조문이 가장 많은 본문을 우선한다.
                rows.sort(key=lambda r: -r["n_articles"])
                return [Match(r["id"], r["name"], r["product"], r["kind"], 0.9, "주계약")
                        for r in rows][:limit]
            return []
        out: list[Match] = []
        for row in self._all_sections():
            if product and row["product"] != product:
                continue
            rk = row["name_key"]
            if not rk:
                continue
            if rk == qk:
                score, reason = 1.0, "이름 일치"
            elif qc and qc == row["core"]:
                score, reason = 0.95, "핵심 이름 일치(형태 표기만 다름)"
            elif qk in rk or rk in qk:
                shorter, longer = sorted((len(qk), len(rk)))
                score, reason = 0.80 + 0.15 * shorter / max(longer, 1), "이름 포함"
            else:
                inter = qt & row["tokens"]
                if not inter:
                    continue
                jac = len(inter) / max(len(qt | row["tokens"]), 1)
                ratio = difflib.SequenceMatcher(None, qk, rk).ratio()
                score = 0.55 * ratio + 0.45 * jac
                reason = "비슷한 이름"
                if score < 0.42:
                    continue
            if row["n_articles"] < 3:
                # 표지·목차처럼 조문이 거의 없는 구간은 뒤로 보낸다.
                score *= 0.5
                reason += " (조문 없음)"
            out.append(Match(row["id"], row["name"], row["product"], row["kind"],
                             round(score, 3), reason))
        out.sort(key=lambda m: (-m.score, len(m.name)))
        # 같은 특약이 여러 상품에 중복 수록된 경우 대표 1건만 남긴다.
        seen: set[str] = set()
        uniq: list[Match] = []
        for m in out:
            k = name_key(m.name)
            if k in seen:
                continue
            seen.add(k)
            uniq.append(m)
        return uniq[:limit]

    def search_text(self, keyword: str, limit: int = 20) -> list[dict]:
        """조문 본문 전체에서 키워드 찾기(약관 근거 확인용)."""
        like = f"%{keyword}%"
        rows = self.con.execute(
            "select a.id, a.no, a.title, a.body, s.name section, p.name product"
            " from articles a join sections s on s.id=a.section_id"
            " join products p on p.id=s.product_id"
            " where a.body like ? limit ?", (like, limit)).fetchall()
        return [dict(r) for r in rows]

    # ------------------------------------------------------------ 상세
    def section(self, section_id: int) -> SectionData:
        row = self.con.execute(
            "select s.*, p.name product from sections s join products p on p.id=s.product_id"
            " where s.id=?", (section_id,)).fetchone()
        if row is None:
            raise KeyError(f"약관 구간을 찾을 수 없습니다: {section_id}")
        data = SectionData(id=row["id"], name=row["name"], product=row["product"],
                           kind=row["kind"], file=row["file"], file_end=row["file_end"] or "",
                           page_start=row["page_start"], page_end=row["page_end"],
                           text=row["text"])
        data.articles = [dict(r) for r in self.con.execute(
            "select no, title, body from articles where section_id=? order by id", (section_id,))]
        for t in self.con.execute(
                "select id, name from code_tables where section_id=? order by id", (section_id,)):
            codes = [dict(c) for c in self.con.execute(
                "select grp, label, code from codes where table_id=? order by id", (t["id"],))]
            data.tables.append({"id": t["id"], "name": t["name"], "codes": codes})
        return data

    def code_table_for(self, section: SectionData, term: str) -> dict | None:
        """'뇌혈관질환' 처럼 특정 용어에 해당하는 분류표 찾기."""
        tk = compact(term)
        for tbl in section.tables:
            if tk and tk in compact(tbl["name"]):
                return tbl
        return section.tables[0] if section.tables else None


_default_store: TermsStore | None = None


def default_store() -> TermsStore:
    global _default_store
    if _default_store is None:
        _default_store = TermsStore()
    return _default_store
