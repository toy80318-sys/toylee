#!/usr/bin/env python3
"""기본 동작 점검 스크립트.

실행:  python3 tests/test_basic.py
(약관 색인이 있으면 색인을 쓰는 검사까지 함께 수행합니다.)
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from noteapp import indexer, proposal  # noqa: E402
from noteapp.explain import build_note, compress_codes, plain_disease  # noqa: E402
from noteapp.store import default_store  # noqa: E402
from noteapp.textutil import core_key, join_lines, key  # noqa: E402

passed = failed = 0


def check(label: str, cond: bool, detail: str = "") -> None:
    global passed, failed
    if cond:
        passed += 1
        print(f"  ✓ {label}")
    else:
        failed += 1
        print(f"  ✗ {label} {detail}")


def test_textutil() -> None:
    print("[텍스트 처리]")
    check("특약명 표기 차이 흡수",
          key("(무)교보뇌혈관질환진단특약(갱신형)Ⅱ") == key("무배당 교보뇌혈관질환진단특약(갱신형) II"))
    check("형태 표기(H/New)를 뺀 핵심 이름",
          core_key("무배당 암진단특약H") == core_key("New무배당암진단특약"))
    joined = join_lines("이 특약에서 정한 사유가\n발생하면 보험금을 지급합니다.\n1. 첫 번째 사유")
    check("줄바꿈 문장 잇기", "발생하면" in joined.split("\n")[0])
    check("항목은 줄 유지", joined.split("\n")[-1].startswith("1."))


def test_indexer() -> None:
    print("[약관 구조 분석]")
    text = ("무배당 예시특약 약관\n제1조 (목적)\n" + "이 특약은 예시입니다. " * 5 +
            "\n제2조 (용어의 정의)\n" + "여기서 말하는 용어는 다음과 같습니다. " * 4 +
            "\n제3조 (의료기관)에서 정한 병원을 말합니다.\n")
    arts = indexer.parse_articles(text)
    check("조문 2개 인식(본문 인용은 제외)", [a.no for a in arts] == [1, 2], str([a.no for a in arts]))

    toc = "제1조 (목적) .12\n제2조 (용어의 정의) .18\n"
    check("목차 줄은 조문으로 보지 않음", indexer.parse_articles(toc) == [])

    table_inline = ("( 별표 4 )\n\"뇌혈관질환\" 분류표\n분류항목 분류코드\n거미막하 출혈 I60\n뇌내출혈 I61\n")
    t1 = indexer.parse_code_tables(table_inline)
    check("한 줄 형식 분류표 파싱", t1 and len(t1[0].items) == 2, str(t1))

    table_split = ("( 별표 4 )\n\"뇌혈관질환\" 분류표\n분류항목\n분류코드\n뇌질환\n거미막하 출혈\nI60\n뇌내출혈\nI61\n")
    t2 = indexer.parse_code_tables(table_split)
    check("두 줄 형식 분류표 파싱", t2 and len(t2[0].items) == 2, str(t2))
    check("분류군 인식", t2 and t2[0].items[0][0] == "뇌질환", str(t2[0].items[:1]) if t2 else "")

    check("표지에서 특약명 추출",
          indexer._cover_name("무배당 예시특약\n약    관\n이 특약의 약관은 무배당 예시특약을 선택하여")
          == "무배당 예시특약")


def test_explain_helpers() -> None:
    print("[쉬운 말 변환]")
    check("연속 코드 범위 묶기",
          compress_codes(["I60", "I61", "I62", "I63", "I64", "I65", "I66", "I67", "I68", "I69"])
          == ["I60~I69"])
    check("사전 기반 설명", "뇌" in plain_disease("1. 거미막하 출혈"))
    check("규칙 기반 설명", plain_disease("12. 갑상선의 악성 신생물(암)") == "갑상선에 생긴 암")


def test_proposal() -> None:
    print("[제안서 읽기]")
    sample = Path(__file__).resolve().parent.parent / "samples" / "제안서_예시.txt"
    prop = proposal.parse_text(sample.read_text(encoding="utf-8"))
    names = [r.name for r in prop.riders]
    check("고객 정보 추출", prop.customer_name == "김보람" and prop.birth == "1985-03-12",
          f"{prop.customer_name}/{prop.birth}")
    check("특약 6건 추출", len(prop.riders) == 6, str(names))
    check("가입금액·보험료 분리",
          any(r.amount == "2,000만원" and r.premium == "12,340" for r in prop.riders),
          str([(r.amount, r.premium) for r in prop.riders]))
    check("이름 속 숫자에 속지 않음",
          any("36대생활습관병입원특약" in n for n in names), str(names))


def test_proposal_numbering() -> None:
    print("[제안서 표기 처리]")
    lines = ("9. 25대생활습관병수술특약(간편N355/갱신형)   1,000만원   5년(최대100세)/5년갱신   1,450\n"
             "13. New플러스보험료납입면제특약(간편N355)4형   *주석참조   20년납/20년만기   1,388\n")
    riders = proposal.parse_riders(lines)
    names = [r.name for r in riders]
    check("목록번호만 제거(이름 속 숫자 유지)",
          any(n.startswith("25대생활습관병수술특약") for n in names), str(names))
    check("'*주석참조' 를 가입금액으로 처리",
          any(r.amount == "주석 참조" for r in riders),
          str([(r.name[:12], r.amount) for r in riders]))
    check("갱신 기간 인식", any("갱신" in r.period for r in riders),
          str([r.period for r in riders]))
    check("상품 표기(무해약환급금형·간편N355)는 매칭에서 무시",
          key("허혈성심장질환진단특약L(무해약환급금형/간편N355)") == key("허혈심장질환진단특약L"))


def test_with_index() -> None:
    store = default_store()
    if not store.ready:
        print("[약관 색인] 색인이 없어 건너뜁니다 (python3 build_index.py 실행 후 다시 검사).")
        return
    print("[약관 색인 연동]")
    note = build_note(store, {"name": "(무)교보뇌혈관질환진단특약(갱신형)Ⅱ", "amount": "2,000만원"})
    check("특약 매칭", note.confidence >= 0.9 and "뇌혈관질환" in note.matched_name,
          note.matched_name)
    codes = [r["code"] for t in note.code_tables for r in t["ranges"]]
    check("뇌혈관질환 코드범위 I60~I69", "I60~I69" in codes, str(codes))
    texts = " ".join(f.text for f in note.cautions)
    check("감액 안내 포함", "50%" in texts)
    check("갱신 안내 포함", "갱신" in texts)
    check("청구서류 안내", any("진단서" in d for d in note.documents), str(note.documents))

    print("[표 안 메모]")
    memo = build_note(store, {"name": "뇌혈관질환진단특약L(무해약환급금형/간편N355)",
                              "amount": "1,000만원", "period": "20년납 / 100세만기"})
    check("구분 자동 분류", memo.group_label == "진단", memo.group_label)
    check("보장 대상 코드 요약", "I60~I69" in memo.code_summary, str(memo.code_summary))
    check("지급 기준에 가입금액 표기", "1,000만원" in memo.pay_basis, memo.pay_basis)
    check("주의 태그 생성", any("50%" in r for r in memo.key_rules), str(memo.key_rules))

    renew = build_note(store, {"name": "NEW플러스수술특약(간편N355/갱신형)",
                               "amount": "1,000만원", "period": "5년납 / 5년갱신"})
    check("갱신 주기는 제안서 값 우선",
          any(r.startswith("5년마다 갱신") for r in renew.key_rules), str(renew.key_rules))

    cancer = build_note(store, {"name": "무배당 암진단특약H"})
    ctexts = " ".join(f.text for f in cancer.cautions)
    check("암 90일 면책 안내", "90일" in ctexts, ctexts[:120])
    check("유사암 제외 안내", "제외" in ctexts)


def main() -> int:
    test_textutil()
    test_indexer()
    test_explain_helpers()
    test_proposal()
    test_proposal_numbering()
    test_with_index()
    print("-" * 46)
    print(f"통과 {passed}건 / 실패 {failed}건")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
