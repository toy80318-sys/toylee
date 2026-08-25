#!/usr/bin/env python3
"""약관 색인을 옵시디언 노트로 내보낸다.

사용법:
    python3 tools/obsidian_export.py                     # 옵시디언_폴더.txt 의 경로로
    python3 tools/obsidian_export.py --vault "D:\\보관함"  # 폴더를 직접 지정
    python3 tools/obsidian_export.py --product 교보평생건강보험 PLUS
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE))

from noteapp import obsidian                      # noqa: E402
from noteapp.store import default_store           # noqa: E402

CONFIG = BASE / "옵시디언_폴더.txt"


def configured_vault() -> str:
    """옵시디언_폴더.txt 에서 보관함 위치를 읽는다(설명 줄은 건너뛴다)."""
    from noteapp import config
    return config.obsidian_vault()


def main() -> int:
    ap = argparse.ArgumentParser(description="약관 색인 -> 옵시디언 노트")
    ap.add_argument("--vault", help="옵시디언 보관함 폴더")
    ap.add_argument("--folder", default=obsidian.FOLDER, help="보관함 안에 만들 폴더 이름")
    ap.add_argument("--product", help="이 상품만 내보내기")
    args = ap.parse_args()

    vault = args.vault or configured_vault()
    if not vault:
        print("옵시디언 보관함 폴더를 알 수 없습니다.")
        print(f"  {CONFIG} 파일을 열어 폴더 경로를 첫 줄에 적어 주세요.")
        print(r"  예)  C:\진이폴더\보험\옵시디언")
        return 1

    store = default_store()
    if not store.ready:
        print("약관 색인이 없습니다. 먼저 프로그램을 한 번 실행하거나 build_index.py 를 돌려 주세요.")
        return 1

    print("=" * 60)
    print(" 약관을 옵시디언 노트로 내보내기")
    print("=" * 60)
    print(f" 보관함: {vault}")

    def progress(done: int, total: int, name: str) -> None:
        if done % 25 == 0 or done == total:
            print(f"  {done}/{total} … {name[:30]}", flush=True)

    try:
        result = obsidian.export(store, Path(vault), folder=args.folder,
                                 product=args.product, progress=progress)
    except RuntimeError as exc:
        print(f" ! {exc}")
        print("   폴더 경로가 맞는지, 옵시디언 보관함을 만들어 두셨는지 확인해 주세요.")
        return 1

    print("-" * 60)
    print(f" 특약 {result.riders}건 · 상품 {result.products}개 · 질병코드 {result.codes}개를 저장했습니다.")
    if result.skipped:
        print(f" (내용을 찾지 못한 구간 {result.skipped}건은 건너뛰었습니다)")
    print(f" 위치: {result.folder}")
    print(" 옵시디언에서 '00 약관 색인' 노트부터 열어 보세요.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
