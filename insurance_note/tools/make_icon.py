#!/usr/bin/env python3
"""바탕화면 아이콘(.ico / .png)을 만든다.

글꼴이 있는 환경에서 한 번만 실행하면 되고, 결과물은 assets/ 에 저장된다.
    python3 tools/make_icon.py
"""
from __future__ import annotations

import struct
import sys
from pathlib import Path

import pymupdf

ASSETS = Path(__file__).resolve().parent.parent / "assets"
SIZE = 256
BRAND = (0.09, 0.32, 0.56)      # 진한 파랑
ACCENT = (1, 1, 1)
FONT_CANDIDATES = [
    "/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf",
    "/usr/share/fonts/truetype/nanum/NanumGothic.ttf",
    "/System/Library/Fonts/AppleSDGothicNeo.ttc",
    "C:/Windows/Fonts/malgunbd.ttf",
]


def _font() -> str | None:
    for path in FONT_CANDIDATES:
        if Path(path).exists():
            return path
    return None


def draw_png() -> bytes:
    doc = pymupdf.open()
    page = doc.new_page(width=SIZE, height=SIZE)
    shape = page.new_shape()
    shape.draw_rect(pymupdf.Rect(6, 6, SIZE - 6, SIZE - 6), radius=0.22)
    shape.finish(fill=BRAND, color=BRAND)
    # 문서 모양(흰 사각형 + 줄)
    shape.draw_rect(pymupdf.Rect(64, 52, 192, 204))
    shape.finish(fill=ACCENT, color=ACCENT)
    shape.commit()

    line = page.new_shape()
    for i, y in enumerate((92, 116, 140, 164)):
        width = 100 if i % 2 == 0 else 74
        line.draw_rect(pymupdf.Rect(84, y, 84 + width, y + 10))
        line.finish(fill=BRAND, color=BRAND)
    line.commit()

    font = _font()
    if font:
        page.insert_font(fontname="kr", fontfile=font)
        page.insert_textbox(pymupdf.Rect(0, 208, SIZE, 250), "보장안내문",
                            fontname="kr", fontsize=30, color=ACCENT, align=1)
    # 아이콘은 256x256 픽셀로 저장한다(윈도우 권장 크기)
    zoom = SIZE / page.rect.width
    pix = page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), alpha=False)
    return pix.tobytes("png")


def png_to_ico(png: bytes) -> bytes:
    """PNG 한 장을 담은 .ico (Windows Vista 이상에서 지원하는 PNG 아이콘)."""
    header = struct.pack("<HHH", 0, 1, 1)                 # 예약, 타입(1=아이콘), 개수
    entry = struct.pack("<BBBBHHII", 0, 0, 0, 0, 1, 32,   # 0 = 256px
                        len(png), 6 + 16)
    return header + entry + png


def main() -> int:
    ASSETS.mkdir(parents=True, exist_ok=True)
    png = draw_png()
    (ASSETS / "보장안내문.png").write_bytes(png)
    (ASSETS / "보장안내문.ico").write_bytes(png_to_ico(png))
    print("아이콘을 만들었습니다:", ASSETS)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
