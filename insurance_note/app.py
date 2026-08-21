#!/usr/bin/env python3
"""고객 맞춤 보장분석 안내문 만들기 - 로컬 웹 프로그램.

실행:  python3 app.py     ->  브라우저에서 http://127.0.0.1:5000 접속
"""
from __future__ import annotations

import sys
import traceback
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from flask import (Flask, jsonify, redirect, render_template, request,  # noqa: E402
                   send_from_directory, url_for)

from noteapp import config, proposal, session as jobs  # noqa: E402
from noteapp.report import build_document  # noqa: E402
from noteapp.store import default_store  # noqa: E402

app = Flask(__name__, template_folder="templates", static_folder="static")
app.config["MAX_CONTENT_LENGTH"] = 60 * 1024 * 1024   # 업로드 60MB 까지


def store():
    return default_store()


@app.context_processor
def inject_common():
    st = store()
    return {"index_ready": st.ready, "index_stats": st.stats() if st.ready else {},
            "ocr_ready": proposal.ocr_available()}


# ---------------------------------------------------------------- 화면

@app.get("/")
def home():
    return render_template("index.html", recent=jobs.recent())


@app.post("/analyze")
def analyze():
    """고객정보 입력 + 제안서 업로드 -> 검토 화면"""
    form = request.form
    payload = {
        "customer": {
            "name": form.get("customer_name", "").strip(),
            "birth": form.get("customer_birth", "").strip(),
            "gender": form.get("customer_gender", "").strip(),
            "phone": form.get("customer_phone", "").strip(),
            "memo": form.get("customer_memo", "").strip(),
        },
        "planner": {
            "name": form.get("planner_name", "").strip(),
            "phone": form.get("planner_phone", "").strip(),
            "org": form.get("planner_org", "").strip(),
        },
        "product": form.get("product", "").strip(),
        "options": {
            "show_full_table": form.get("show_full_table") == "on",
            "show_sources": form.get("show_sources") == "on",
            "greeting": form.get("greeting", "").strip(),
        },
        "riders": [],
        "total_premium": "",
    }

    parsed = None
    warnings: list[str] = []
    upload = request.files.get("proposal")
    pasted = form.get("pasted_text", "").strip()
    try:
        if upload and upload.filename:
            dest = config.UPLOAD_DIR / f"{jobs.new_job_id()}_{Path(upload.filename).name}"
            upload.save(dest)
            parsed = proposal.parse_file(dest, force_ocr=form.get("force_ocr") == "on")
            if parsed.used_ocr:
                warnings.append("스캔본이라 OCR(글자 인식)로 읽었습니다. 특약 이름이 잘못 읽혔을 수 "
                                "있으니 아래 목록을 꼭 확인해 주세요.")
            if not parsed.riders:
                warnings.append("제안서에서 특약 목록을 자동으로 찾지 못했습니다. "
                                "아래에서 직접 추가해 주세요.")
        elif pasted:
            parsed = proposal.parse_text(pasted)
    except Exception as exc:  # 업로드 실패해도 수동 입력으로 계속 진행
        warnings.append(f"제안서를 읽는 중 문제가 발생했습니다: {exc}")

    if parsed:
        payload["customer"]["name"] = payload["customer"]["name"] or parsed.customer_name
        payload["customer"]["birth"] = payload["customer"]["birth"] or parsed.birth
        payload["customer"]["gender"] = payload["customer"]["gender"] or parsed.gender
        payload["product"] = payload["product"] or parsed.product
        payload["total_premium"] = parsed.total_premium
        payload["riders"] = [r.to_dict() for r in parsed.riders]

    if not store().ready:
        warnings.append("약관 색인이 아직 없습니다. 터미널에서 'python3 build_index.py' 를 "
                        "먼저 실행해 주세요.")
        doc = {"customer": payload["customer"], "planner": payload["planner"],
               "product": payload["product"], "options": payload["options"],
               "notes": [], "summary": {"total": 0, "matched": 0, "unmatched": 0}}
    else:
        doc = build_document(store(), payload)

    job_id = jobs.new_job_id()
    jobs.save(job_id, {**payload, "document": doc})
    return render_template("review.html", job_id=job_id, doc=doc, payload=payload,
                           warnings=warnings,
                           products=store().products() if store().ready else [])


@app.post("/rebuild")
def rebuild():
    """화면에서 편집한 내용으로 안내문 데이터를 다시 만든다."""
    payload = request.get_json(force=True)
    try:
        doc = build_document(store(), payload)
    except Exception as exc:
        traceback.print_exc()
        return jsonify({"ok": False, "error": str(exc)}), 400
    job_id = payload.get("job_id") or jobs.new_job_id()
    jobs.save(job_id, {**payload, "document": doc})
    return jsonify({"ok": True, "job_id": job_id, "doc": doc})


@app.get("/report/<job_id>")
def report(job_id: str):
    data = jobs.load(job_id)
    return render_template("report.html", doc=data["document"], job_id=job_id)


@app.get("/job/<job_id>")
def job_detail(job_id: str):
    data = jobs.load(job_id)
    return render_template("review.html", job_id=job_id, doc=data["document"],
                           payload=data, warnings=[],
                           products=store().products() if store().ready else [])


# ---------------------------------------------------------------- API

@app.get("/api/search")
def api_search():
    q = request.args.get("q", "").strip()
    product = request.args.get("product") or None
    if not q or not store().ready:
        return jsonify([])
    return jsonify([{"section_id": m.section_id, "name": m.name, "product": m.product,
                     "score": m.score, "reason": m.reason}
                    for m in store().search(q, product=product, limit=10)])


@app.get("/api/section/<int:section_id>")
def api_section(section_id: int):
    sec = store().section(section_id)
    return jsonify({
        "id": sec.id, "name": sec.name, "product": sec.product,
        "source": sec.source_label,
        "articles": [{"no": a["no"], "title": a["title"], "body": a["body"]}
                     for a in sec.articles],
        "tables": sec.tables,
    })


@app.get("/uploads/<path:filename>")
def uploaded(filename: str):
    return send_from_directory(config.UPLOAD_DIR, filename)


@app.errorhandler(404)
def not_found(_):
    return redirect(url_for("home"))


def main() -> int:
    st = store()
    print("=" * 60)
    print(" 고객 맞춤 보장분석 안내문 만들기")
    print("=" * 60)
    if st.ready:
        s = st.stats()
        print(f" 약관 색인: 상품 {s['products']}개 / 약관구간 {s['sections']}개 / "
              f"질병코드 {s['codes']}개 ({s['built_at']})")
    else:
        print(" ! 약관 색인이 없습니다. 먼저 'python3 build_index.py' 를 실행하세요.")
    print(f" OCR(스캔 읽기): {'사용 가능' if proposal.ocr_available() else '미설치'}")
    print(" 브라우저에서 http://127.0.0.1:5000 로 접속하세요. (종료: Ctrl+C)")
    app.run(host="127.0.0.1", port=int(__import__('os').environ.get("PORT", 5000)),
            debug=False)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
