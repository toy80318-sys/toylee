#!/usr/bin/env python3
"""바탕화면에 실행 아이콘을 만든다.

    python3 tools/make_shortcut.py
윈도우는 바로가기(.lnk), 맥은 실행 파일 별칭, 리눅스는 .desktop 파일을 만든다.
"""
from __future__ import annotations

import os
import subprocess
import sys
import tempfile
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
NAME = "보장안내문 만들기"
ICON_ICO = BASE / "assets" / "보장안내문.ico"
ICON_PNG = BASE / "assets" / "보장안내문.png"


def desktop_dir() -> Path:
    """바탕화면 폴더 찾기(한글 윈도우·맥·리눅스 모두 대응)."""
    home = Path.home()
    for name in ("Desktop", "바탕화면", "바탕 화면"):
        path = home / name
        if path.is_dir():
            return path
    if os.name == "nt":                       # OneDrive 등으로 위치가 바뀐 경우
        try:
            import ctypes.wintypes as wt
            import ctypes
            buf = ctypes.create_unicode_buffer(wt.MAX_PATH)
            ctypes.windll.shell32.SHGetFolderPathW(None, 0, None, 0, buf)
            if buf.value:
                return Path(buf.value)
        except Exception:
            pass
    return home


def make_windows(dest: Path) -> Path:
    target = BASE / "실행하기.bat"
    link = dest / f"{NAME}.lnk"
    script = (
        "$s = (New-Object -ComObject WScript.Shell).CreateShortcut('{link}')\n"
        "$s.TargetPath = '{target}'\n"
        "$s.WorkingDirectory = '{base}'\n"
        "$s.IconLocation = '{icon}'\n"
        "$s.Description = '고객 맞춤 보장분석 안내문 만들기'\n"
        "$s.Save()\n"
    ).format(link=link, target=target, base=BASE, icon=ICON_ICO)
    # 한글이 깨지지 않도록 UTF-8(BOM) 파일로 저장한 뒤 실행한다.
    with tempfile.NamedTemporaryFile("w", suffix=".ps1", delete=False,
                                     encoding="utf-8-sig") as fp:
        fp.write(script)
        ps1 = fp.name
    try:
        subprocess.run(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass",
                        "-File", ps1], check=True)
    finally:
        os.unlink(ps1)
    return link


def make_unix(dest: Path) -> Path:
    if sys.platform == "darwin":              # 맥: 실행 파일을 가리키는 심볼릭 링크
        link = dest / f"{NAME}.command"
        if link.exists() or link.is_symlink():
            link.unlink()
        link.symlink_to(BASE / "실행하기.command")
        return link
    link = dest / f"{NAME}.desktop"           # 리눅스: 실행 아이콘 파일
    link.write_text(
        "[Desktop Entry]\n"
        "Type=Application\n"
        f"Name={NAME}\n"
        "Comment=고객 맞춤 보장분석 안내문 만들기\n"
        f"Exec=\"{BASE / '실행하기.command'}\"\n"
        f"Icon={ICON_PNG}\n"
        f"Path={BASE}\n"
        "Terminal=true\n", encoding="utf-8")
    link.chmod(0o755)
    return link


def main() -> int:
    dest = desktop_dir()
    try:
        link = make_windows(dest) if os.name == "nt" else make_unix(dest)
    except Exception as exc:
        print(f"[!] 아이콘을 만들지 못했습니다: {exc}")
        print(f"    대신 이 폴더의 '실행하기' 파일을 바탕화면으로 끌어다 놓으셔도 됩니다: {BASE}")
        return 1
    print("바탕화면에 아이콘을 만들었습니다.")
    print(f"  {link}")
    print("이제 아이콘을 더블클릭하면 프로그램이 켜지고 브라우저가 자동으로 열립니다.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
