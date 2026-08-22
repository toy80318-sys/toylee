#!/usr/bin/env python3
"""아이콘 하나로 실행하기 위한 시작 프로그램.

처음 실행하면 필요한 패키지를 설치하고 약관 색인을 만든 뒤,
웹 화면을 띄우고 브라우저를 자동으로 엽니다. 두 번째부터는 바로 실행됩니다.
"""
from __future__ import annotations

import subprocess
import sys
from datetime import datetime
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
SETUP_MARK = BASE / ".setup_done"
LOG = BASE / "실행기록.txt"


def line(text: str = "") -> None:
    """화면에 보여주고, 같은 내용을 실행기록.txt 에도 남긴다."""
    print(text, flush=True)
    try:
        with LOG.open("a", encoding="utf-8") as fp:
            fp.write(text + "\n")
    except Exception:
        pass                                                  # 기록 실패해도 계속 진행


def start_log() -> None:
    try:
        LOG.write_text(f"[실행 기록] {datetime.now():%Y-%m-%d %H:%M:%S}\n"
                       f"폴더: {BASE}\n"
                       f"파이썬: {sys.version.split()[0]} ({sys.executable})\n"
                       + "-" * 60 + "\n", encoding="utf-8")
    except Exception:
        pass


def run(args: list[str], what: str) -> bool:
    line(f"  → {what}")
    try:
        proc = subprocess.run(args, cwd=BASE, capture_output=True, text=True)
    except Exception as exc:                                  # 실행 자체가 안 될 때
        line(f"  ! {what} 중 문제가 발생했습니다: {exc}")
        return False
    tail = (proc.stdout or "") + (proc.stderr or "")
    if proc.returncode != 0:
        for row in tail.strip().splitlines()[-12:]:           # 마지막 오류 내용만
            line(f"    {row}")
    return proc.returncode == 0


def ensure_packages() -> bool:
    try:
        import flask  # noqa: F401
        import pymupdf  # noqa: F401
        SETUP_MARK.write_text("ok", encoding="utf-8")
        return True
    except ImportError:
        pass
    line("[1/2] 필요한 프로그램을 설치합니다. 처음 한 번만 하며 1~2분 걸립니다.")
    ok = run([sys.executable, "-m", "pip", "install", "--disable-pip-version-check",
              "-r", str(BASE / "requirements.txt")], "설치 중")
    if ok:
        SETUP_MARK.write_text("ok", encoding="utf-8")
        line("  설치를 마쳤습니다.")
    else:
        line("  ! 설치에 실패했습니다. 인터넷 연결을 확인한 뒤 다시 실행해 주세요.")
    return ok


def ensure_index() -> bool:
    sys.path.insert(0, str(BASE))
    from noteapp import config                                # 설치 후에 불러온다

    if Path(config.INDEX_DB).exists():
        return True
    pdfs = list(Path(config.TERMS_DIR).glob("*.pdf"))
    if not pdfs:
        line("  ! 약관 PDF 를 찾지 못했습니다.")
        line(f"  이 폴더 안에 약관 PDF 가 있어야 합니다: {config.TERMS_DIR}")
        line("  압축(ZIP)을 풀지 않고 실행했거나, insurance_note 폴더만 따로 옮긴 경우입니다.")
        line("  받은 폴더 구조를 그대로 두고 다시 실행해 주세요.")
        return False

    line(f"[2/2] 약관 {len(pdfs)}개를 읽어 색인을 만듭니다. 처음 한 번만 하며 1~2분 걸립니다.")
    ok = run([sys.executable, str(BASE / "build_index.py")], "약관 읽는 중")
    if not ok:
        line("  ! 약관 색인을 만들지 못했습니다.")
        line(f"  약관 PDF 가 이 폴더에 있는지 확인해 주세요: {config.TERMS_DIR}")
    return ok


def main() -> int:
    start_log()
    # 안내 문구(제목 줄)는 app.main() 이 출력하므로 여기서는 준비 과정만 알린다.
    if not ensure_packages():
        line(f"\n자세한 내용은 이 파일에 저장했습니다: {LOG}")
        return 1
    if not ensure_index():
        line(f"\n자세한 내용은 이 파일에 저장했습니다: {LOG}")
        return 1

    sys.path.insert(0, str(BASE))
    import app                                                # noqa: PLC0415
    return app.main()


if __name__ == "__main__":
    try:
        code = main()
    except KeyboardInterrupt:
        code = 0
    if code:
        try:
            input("\n창을 닫으려면 Enter 키를 누르세요...")
        except (EOFError, KeyboardInterrupt):
            pass
    raise SystemExit(code)
