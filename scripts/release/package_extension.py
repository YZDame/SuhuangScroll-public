#!/usr/bin/env python3
"""Validate and package the built Chrome extension for GitHub Releases."""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import zipfile
from pathlib import Path
from urllib.parse import urlparse

from release_metadata import build_release_metadata


ROOT = Path(__file__).resolve().parents[2]
CANONICAL_PUBLIC_BASE = b"https://suhuangscroll.com"


def validate_public_base_url(value: str) -> str:
    parsed = urlparse(value)
    hostname = (parsed.hostname or "").lower()
    if parsed.scheme != "https" or not parsed.netloc or parsed.query or parsed.fragment:
        raise SystemExit("--public-base-url must be an HTTPS origin/path without query or fragment")
    if hostname in {"localhost", "127.0.0.1", "::1", "example.com", "example.org", "example.net"}:
        raise SystemExit("--public-base-url must be a real public HTTPS origin")
    if hostname.endswith(".local") or hostname.startswith("your-"):
        raise SystemExit("--public-base-url must not use a development or placeholder host")
    return value.rstrip("/")


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _package_paths(dist_dir: Path, *, chrome_store: bool) -> list[Path]:
    excluded_names = {".DS_Store"}
    excluded_suffixes = {".map"}
    excluded_files = {"vite.svg"}
    paths: list[Path] = []
    for path in dist_dir.rglob("*"):
        if not path.is_file():
            continue
        if ".vite" in path.relative_to(dist_dir).parts:
            continue
        if path.name in excluded_names or path.name in excluded_files:
            continue
        if path.suffix in excluded_suffixes:
            continue
        if chrome_store and path.name == "release.json":
            continue
        paths.append(path)
    return sorted(paths)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--version", required=True)
    parser.add_argument("--dist-dir", default="extension/dist")
    parser.add_argument("--out-dir", default="dist/release")
    parser.add_argument(
        "--output",
        help="Optional archive path for a separate public candidate.",
    )
    parser.add_argument(
        "--channel",
        choices=["release", "chrome-store"],
        default="release",
        help="Package channel; chrome-store excludes release metadata and development artifacts.",
    )
    parser.add_argument(
        "--public-base-url",
        help="Public HTTPS site base; rewrites the archived manifest homepage_url without changing the source manifest.",
    )
    args = parser.parse_args()

    dist_dir = ROOT / args.dist_dir
    if not dist_dir.exists():
        raise SystemExit(f"Extension dist directory not found: {dist_dir}")

    manifest_path = dist_dir / "manifest.json"
    if not manifest_path.exists():
        source_manifest = ROOT / "extension" / "manifest.json"
        if source_manifest.exists():
            shutil.copy2(source_manifest, manifest_path)
    if not manifest_path.exists():
        raise SystemExit("Built extension is missing manifest.json")

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("manifest_version") != 3:
        raise SystemExit("Extension manifest_version must be 3")
    if manifest.get("name") != "Suhuang Scroll Bridge":
        raise SystemExit("Extension name must be Suhuang Scroll Bridge")
    if manifest.get("version") != args.version:
        raise SystemExit(
            f"Extension manifest version {manifest.get('version')!r} does not match {args.version!r}"
        )
    if not (dist_dir / "sidepanel.html").exists():
        raise SystemExit("Built extension is missing sidepanel.html")
    if len(str(manifest.get("description", ""))) > 132:
        raise SystemExit("Extension description exceeds Chrome Web Store's 132-character limit")
    icons = manifest.get("icons") or {}
    missing_icons = [str(path) for path in icons.values() if not (dist_dir / path).exists()]
    if missing_icons:
        raise SystemExit(f"Built extension is missing icons: {', '.join(missing_icons)}")
    if not manifest.get("side_panel", {}).get("default_path"):
        raise SystemExit("Built extension is missing side_panel.default_path")
    manifest_bytes: bytes | None = None
    if args.public_base_url:
        base_url = validate_public_base_url(args.public_base_url)
        manifest = dict(manifest)
        manifest["homepage_url"] = f"{base_url}/"
        manifest_bytes = (json.dumps(manifest, indent=2, ensure_ascii=False) + "\n").encode("utf-8")
    host_permissions = manifest.get("host_permissions") or []
    if not any("localhost" in item or "127.0.0.1" in item for item in host_permissions):
        raise SystemExit("Extension must declare a local API host permission")
    (dist_dir / "release.json").write_text(
        json.dumps(build_release_metadata(args.version, "chrome-extension"), indent=2) + "\n",
        encoding="utf-8",
    )

    out_dir = ROOT / args.out_dir
    out_dir.mkdir(parents=True, exist_ok=True)
    suffix = "-ChromeStore" if args.channel == "chrome-store" else ""
    archive = (
        Path(args.output).expanduser()
        if args.output
        else out_dir / f"SuhuangScroll-Bridge{suffix}-v{args.version}.zip"
    )
    archive.parent.mkdir(parents=True, exist_ok=True)
    if archive.exists():
        archive.unlink()

    with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED) as zip_file:
        for path in _package_paths(dist_dir, chrome_store=args.channel == "chrome-store"):
            relative = path.relative_to(dist_dir)
            if relative.as_posix() == "manifest.json" and manifest_bytes is not None:
                zip_file.writestr(relative.as_posix(), manifest_bytes)
            else:
                payload = path.read_bytes()
                if args.public_base_url:
                    payload = payload.replace(CANONICAL_PUBLIC_BASE, args.public_base_url.rstrip("/").encode("utf-8"))
                zip_file.writestr(relative.as_posix(), payload)

    checksum = _sha256(archive)
    checksum_path = archive.with_suffix(archive.suffix + ".sha256")
    checksum_path.write_text(f"{checksum}  {archive.name}\n", encoding="utf-8")
    print(archive)
    print(checksum_path)


if __name__ == "__main__":
    main()
