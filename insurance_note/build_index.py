#!/usr/bin/env python3
"""약관 PDF 색인 만들기.

사용법:
    python3 build_index.py                 # 저장소 최상위의 PDF 전체를 색인
    python3 build_index.py --dir ./약관     # 다른 폴더를 색인
처음 한 번만 실행하면 되고, 약관 PDF 를 추가·교체했을 때 다시 실행하면 됩니다.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from noteapp import config, indexer  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser(description="약관 PDF 색인 생성")
    ap.add_argument("--dir", default=str(config.TERMS_DIR), help="약관 PDF 폴더")
    ap.add_argument("--db", default=str(config.INDEX_DB), help="색인 파일 경로")
    ap.add_argument("--quiet", action="store_true")
    args = ap.parse_args()

    def log(msg: str) -> None:
        if not args.quiet:
            print(msg, flush=True)

    log(f"약관 폴더 : {args.dir}")
    log(f"색인 파일 : {args.db}")
    stats = indexer.build(Path(args.dir), Path(args.db), progress=log)
    log("─" * 50)
    log(f"완료: 상품 {stats['products']}개 / 파일 {stats['files']}개 / "
        f"약관구간 {stats['sections']}개 / 조문 {stats['articles']}개 / "
        f"분류표 {stats['tables']}개 / 질병코드 {stats['codes']}개 "
        f"({stats['seconds']}초)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
