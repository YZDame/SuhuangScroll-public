#!/usr/bin/env python3
"""Validate the graphic assets required by the Chrome Web Store listing."""

from __future__ import annotations

import struct
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def png_size(path: Path) -> tuple[int, int]:
    data = path.read_bytes()
    if data[:8] != b"\x89PNG\r\n\x1a\n" or data[12:16] != b"IHDR":
        raise ValueError(f"{path} is not a PNG with an IHDR chunk")
    return struct.unpack(">II", data[16:24])


def main() -> int:
    expected = {
        ROOT / "extension/store/assets/screenshot-runtime-bridge.png": (1280, 800),
        ROOT / "extension/store/assets/promo-small.png": (440, 280),
        ROOT / "extension/public/icons/icon128.png": (128, 128),
    }
    errors: list[str] = []
    for path, dimensions in expected.items():
        if not path.exists():
            errors.append(f"missing asset: {path.relative_to(ROOT)}")
            continue
        try:
            actual = png_size(path)
        except (OSError, ValueError) as error:
            errors.append(str(error))
            continue
        if actual != dimensions:
            errors.append(
                f"{path.relative_to(ROOT)} has dimensions {actual}, expected {dimensions}"
            )

    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 1
    print("Chrome Web Store assets: OK (icon, screenshot, small promo)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
