#!/usr/bin/env python3
"""명령줄에서 바로 안내문(HTML) 만들기.

예)
  python3 make_note.py --proposal 제안서.pdf --name 홍길동 --planner 이설계 \
      --out 홍길동_보장안내문.html

만들어진 HTML 파일을 브라우저에서 열고 [인쇄]하면 A4로 출력되고,
'PDF로 저장'을 고르면 PDF 파일이 됩니다.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from flask import render_template  # noqa: E402

from app import app  # noqa: E402
from noteapp import config, proposal  # noqa: E402
from noteapp.report import build_document  # noqa: E402
from noteapp.store import default_store  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser(description="상품제안서 -> 고객용 보장 안내문(A4 HTML)")
    ap.add_argument("--proposal", help="상품제안서 파일(PDF·스캔 이미지·txt)")
    ap.add_argument("--rider", action="append", default=[],
                    help="특약을 직접 지정(여러 번 사용 가능). 예: --rider '무배당 암진단특약H'")
    ap.add_argument("--name", default="", help="고객 성함")
    ap.add_argument("--birth", default="", help="생년월일")
    ap.add_argument("--gender", default="", help="성별")
    ap.add_argument("--phone", default="", help="고객 연락처")
    ap.add_argument("--memo", default="", help="상담 메모")
    ap.add_argument("--product", default="", help="상품명(비우면 제안서에서 찾음)")
    ap.add_argument("--planner", default="", help="설계사 성함")
    ap.add_argument("--planner-phone", default="", help="설계사 연락처")
    ap.add_argument("--planner-org", default="", help="설계사 소속")
    ap.add_argument("--greeting", default="", help="맺음 인사말")
    ap.add_argument("--full-table", action="store_true", help="질병분류표 전체 싣기")
    ap.add_argument("--no-sources", action="store_true", help="근거 조문 숨기기")
    ap.add_argument("--table-only", action="store_true",
                    help="계약사항 표(메모 포함)만 인쇄하고 특약별 상세는 생략")
    ap.add_argument("--force-ocr", action="store_true", help="글자가 있어도 OCR로 읽기")
    ap.add_argument("--out", default="보장안내문.html", help="저장할 HTML 파일 경로")
    args = ap.parse_args()

    store = default_store()
    if not store.ready:
        print("약관 색인이 없습니다. 먼저 'python3 build_index.py' 를 실행하세요.")
        return 2

    riders = [{"name": r} for r in args.rider]
    parsed = None
    if args.proposal:
        parsed = proposal.parse_file(Path(args.proposal), force_ocr=args.force_ocr)
        riders = [r.to_dict() for r in parsed.riders] + riders
        print(f"제안서에서 특약 {len(parsed.riders)}건을 찾았습니다"
              f"{' (OCR 사용)' if parsed.used_ocr else ''}.")
    if not riders:
        print("분석할 특약이 없습니다. --proposal 또는 --rider 를 지정하세요.")
        return 2

    payload = {
        "customer": {"name": args.name or (parsed.customer_name if parsed else ""),
                     "birth": args.birth or (parsed.birth if parsed else ""),
                     "gender": args.gender or (parsed.gender if parsed else ""),
                     "phone": args.phone, "memo": args.memo},
        "planner": {"name": args.planner, "phone": args.planner_phone, "org": args.planner_org},
        "product": args.product or (parsed.product if parsed else ""),
        "total_premium": parsed.total_premium if parsed else "",
        "options": {"show_full_table": args.full_table,
                    "show_sources": not args.no_sources,
                    "table_only": args.table_only,
                    "greeting": args.greeting},
        "riders": riders,
    }
    doc = build_document(store, payload)

    css = (config.BASE_DIR / "static" / "print.css").read_text(encoding="utf-8")
    with app.test_request_context():
        html = render_template("report.html", doc=doc, job_id=None, inline_css=css)
    out = Path(args.out)
    out.write_text(html, encoding="utf-8")

    print(f"안내문을 만들었습니다: {out.resolve()}")
    print(f"  특약 {doc['summary']['total']}건 중 약관 매칭 {doc['summary']['matched']}건"
          + (f" / 확인 필요 {doc['summary']['unmatched']}건" if doc['summary']['unmatched'] else ""))
    for n in doc["notes"]:
        mark = "  ?" if n["unmatched"] else "  ·"
        print(f"{mark} {n['input_name']} → {n['matched_name'] or '미매칭'}"
              f" ({int(n['confidence'] * 100)}%)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
