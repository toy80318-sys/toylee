"""제안서 + 약관 색인 -> 고객용 안내문 데이터 조립."""
from __future__ import annotations

from datetime import date

from .explain import RiderNote, build_note
from .store import TermsStore
from .textutil import compact


def build_document(store: TermsStore, payload: dict) -> dict:
    """화면(또는 CLI)에서 넘어온 입력을 인쇄용 데이터로 만든다.

    payload = {
      customer: {name, birth, gender, phone, memo},
      planner:  {name, phone, org},
      product: "교보평생건강보험 PLUS",
      options: {show_full_table: bool, show_sources: bool, greeting: str},
      riders: [{name, amount, premium, period, section_id?, note?}]
    }
    """
    customer = payload.get("customer", {})
    planner = payload.get("planner", {})
    options = payload.get("options", {})
    product_hint = payload.get("product") or None
    product_key = None
    if product_hint:
        for name in store.products():
            if compact(product_hint).startswith(compact(name)) or compact(name) in compact(product_hint):
                product_key = name
                break

    notes: list[RiderNote] = []
    for item in payload.get("riders", []):
        if not (item.get("name") or "").strip() and not item.get("section_id"):
            continue
        notes.append(build_note(store, item, product_hint=product_key))

    matched = [n for n in notes if not n.unmatched]
    return {
        "customer": customer,
        "planner": planner,
        "product": payload.get("product", ""),
        "product_key": product_key or "",
        "options": {
            "show_full_table": bool(options.get("show_full_table", False)),
            "show_sources": bool(options.get("show_sources", True)),
            "greeting": options.get("greeting", ""),
        },
        "created_at": date.today().isoformat(),
        "notes": [n.to_dict() for n in notes],
        "summary": {
            "total": len(notes),
            "matched": len(matched),
            "unmatched": len(notes) - len(matched),
            "total_premium": payload.get("total_premium", ""),
        },
    }
