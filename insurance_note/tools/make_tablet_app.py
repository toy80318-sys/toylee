#!/usr/bin/env python3
"""약관 색인 -> 태블릿용 화면 파일(HTML) 하나.

만들어진 파일을 태블릿에 옮겨 브라우저로 열면, 인터넷 없이도
특약 검색 · 질병코드 조회 · 계약사항 표 인쇄를 할 수 있다.

사용법:
    python3 tools/make_tablet_app.py                 # 바탕화면에 저장
    python3 tools/make_tablet_app.py --out 내파일.html
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE))

from noteapp import config                      # noqa: E402
from noteapp.explain import build_note          # noqa: E402
from noteapp.obsidian import FOLDER, safe_title, unique_titles   # noqa: E402
from noteapp.store import default_store         # noqa: E402

TEMPLATE = BASE / "templates" / "tablet.html"


def rider_data(store) -> list[dict]:
    """화면에 담을 특약 정보(약관 원문이 아니라 정리된 설명만)."""
    out = []
    rows = store._all_sections()
    # 옵시디언 노트 제목을 그대로 담아 둔다. 화면에서 [[링크]] 를 만들 때
    # 실제 파일 제목과 글자 하나라도 다르면 옵시디언에서 링크가 깨진다.
    titles = unique_titles(rows)
    for i, row in enumerate(rows, 1):
        note = build_note(store, {"name": row["name"], "section_id": row["id"]})
        if note.unmatched or not note.headline:
            continue
        codes, items = [], []
        for table in note.code_tables:
            for rng in table.get("ranges", []):
                codes.append({"c": rng["code"], "m": rng.get("meaning", "")})
            for group in table.get("groups", []):
                for item in group.get("items", [])[:40]:
                    items.append({"l": item.get("label", ""), "c": item.get("code", ""),
                                  "p": item.get("plain", "")})
        out.append({
            "id": row["id"], "n": note.matched_name, "pr": note.product, "g": note.group_label,
            "t": titles[row["id"]], "pt": safe_title(note.product),
            "h": note.headline, "codes": codes, "items": items[:40],
            "pay": [f.text for f in note.payouts][:6],
            "cau": [f.text for f in note.cautions][:8],
            "exc": [f.text for f in note.exclusions][:5],
            "doc": note.documents[:6], "src": note.source_label,
        })
        if i % 100 == 0:
            print(f"  {i}/{len(rows)}", flush=True)
    return out


def artifact_html(html: str) -> str:
    """웹에 올리는 용도(아티팩트)로 겉껍데기를 벗긴 본문만 남긴다.

    올리는 쪽에서 <html><head><body> 를 다시 씌우므로, 그대로 올리면 문서가
    두 겹이 된다. 제목·모양(style)·내용만 순서대로 이어 붙인다.
    """
    import re

    head = re.search(r"<head>(.*?)</head>", html, re.S)
    body = re.search(r"<body>(.*?)</body>", html, re.S)
    if not head or not body:
        raise RuntimeError("화면 서식이 예상과 다릅니다.")
    keep = re.findall(r"<title>.*?</title>|<style>.*?</style>", head.group(1), re.S)
    return "\n".join(keep) + "\n" + body.group(1).strip() + "\n"


def default_vault() -> str:
    """옵시디언 보관함 이름(경로의 마지막 폴더 이름).

    설정해 두면 화면의 '보관함 이름' 칸이 미리 채워진다. 윈도우 경로를 리눅스에서
    다룰 수도 있으므로 두 가지 구분 기호를 모두 잘라 낸다.
    """
    path = (config.obsidian_vault() or "").replace("\\", "/").rstrip("/")
    return path.rsplit("/", 1)[-1] if path else ""


def desktop_dir() -> Path:
    for name in ("Desktop", "바탕 화면", "바탕화면"):
        path = Path.home() / name
        if path.exists():
            return path
    return Path.home()


def main() -> int:
    ap = argparse.ArgumentParser(description="약관 색인 -> 태블릿용 화면 파일")
    ap.add_argument("--out", help="저장할 파일 경로")
    ap.add_argument("--artifact", help="웹에 올릴 본문만 따로 저장할 경로")
    ap.add_argument("--vault", help="화면에 미리 채울 옵시디언 보관함 이름"
                                    " (빈 값으로 두면 마지막에 쓰던 보관함을 씁니다)")
    args = ap.parse_args()

    store = default_store()
    if not store.ready:
        print("약관 색인이 없습니다. 먼저 실행하기 로 색인을 만들어 주세요.")
        return 1
    if not TEMPLATE.exists():
        print(f"화면 서식 파일이 없습니다: {TEMPLATE}")
        return 1

    print("=" * 60)
    print(" 태블릿용 화면 만들기")
    print("=" * 60)
    data = rider_data(store)
    html = (TEMPLATE.read_text(encoding="utf-8")
            .replace("__DATA__", json.dumps(data, ensure_ascii=False, separators=(",", ":")))
            .replace("__FOLDER__", json.dumps(FOLDER, ensure_ascii=False))
            .replace("__VAULT__", json.dumps(
                default_vault() if args.vault is None else args.vault, ensure_ascii=False)))

    out = Path(args.out) if args.out else desktop_dir() / "보장분석_도우미.html"
    out.write_text(html, encoding="utf-8")
    if args.artifact:
        Path(args.artifact).write_text(artifact_html(html), encoding="utf-8")
        print(f" 웹에 올릴 파일: {args.artifact}")
    print("-" * 60)
    print(f" 특약 {len(data)}건을 담았습니다. ({out.stat().st_size/1024/1024:.1f}MB)")
    print(f" 저장 위치: {out}")
    print(" 이 파일 하나만 태블릿으로 옮겨 브라우저로 열면 됩니다.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
