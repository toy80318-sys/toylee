"""작업(고객 1건) 저장/불러오기 - 파일 기반의 아주 단순한 저장소."""
from __future__ import annotations

import json
import re
import uuid
from datetime import datetime
from pathlib import Path

from . import config

_SAFE = re.compile(r"[^0-9a-zA-Z가-힣_\-]+")


def new_job_id() -> str:
    return datetime.now().strftime("%Y%m%d-%H%M%S-") + uuid.uuid4().hex[:6]


def job_path(job_id: str) -> Path:
    return config.OUTPUT_DIR / f"{_SAFE.sub('', job_id)}.json"


def save(job_id: str, data: dict) -> Path:
    data = dict(data)
    data["job_id"] = job_id
    data["saved_at"] = datetime.now().isoformat(timespec="seconds")
    path = job_path(job_id)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    return path


def load(job_id: str) -> dict:
    path = job_path(job_id)
    if not path.exists():
        raise KeyError(f"저장된 작업을 찾을 수 없습니다: {job_id}")
    return json.loads(path.read_text(encoding="utf-8"))


def recent(limit: int = 20) -> list[dict]:
    items = []
    for p in sorted(config.OUTPUT_DIR.glob("*.json"), key=lambda x: x.stat().st_mtime,
                    reverse=True)[:limit]:
        try:
            d = json.loads(p.read_text(encoding="utf-8"))
        except Exception:
            continue
        items.append({
            "job_id": d.get("job_id", p.stem),
            "customer_name": d.get("customer", {}).get("name", ""),
            "product": d.get("product", ""),
            "saved_at": d.get("saved_at", ""),
            "riders": len(d.get("riders", [])),
        })
    return items
