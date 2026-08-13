#!/usr/bin/env python3
"""Create a clean deployment archive for the hosted MCP control plane."""

from __future__ import annotations

import argparse
import hashlib
import json
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SERVICE_ROOT = ROOT / "services" / "mcp-control-plane"


def checksum(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out-dir", default="dist/release")
    args = parser.parse_args()

    manifest = json.loads((SERVICE_ROOT / "package.json").read_text(encoding="utf-8"))
    version = str(manifest["version"])
    out_dir = ROOT / args.out_dir
    out_dir.mkdir(parents=True, exist_ok=True)
    archive = out_dir / f"SuhuangScroll-MCP-ControlPlane-v{version}.zip"
    if archive.exists():
        archive.unlink()

    with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED) as zip_file:
        for path in sorted(SERVICE_ROOT.rglob("*")):
            if not path.is_file() or ".DS_Store" in path.parts or "node_modules" in path.parts:
                continue
            relative = path.relative_to(SERVICE_ROOT)
            zip_file.write(path, Path("suhuang-scroll-mcp-control-plane") / relative)

    checksum_path = archive.with_suffix(archive.suffix + ".sha256")
    checksum_path.write_text(f"{checksum(archive)}  {archive.name}\n", encoding="utf-8")
    print(archive)
    print(checksum_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
