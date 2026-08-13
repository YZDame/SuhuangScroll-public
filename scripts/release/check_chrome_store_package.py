#!/usr/bin/env python3
"""Validate a Chrome Web Store upload archive without opening a browser."""

from __future__ import annotations

import argparse
import json
import re
import sys
import zipfile
from urllib.parse import urlparse


SEMVER = re.compile(r"^\d+\.\d+\.\d+$")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive")
    parser.add_argument("--version", required=True)
    parser.add_argument(
        "--public-base-url",
        help="When supplied, require the archive homepage_url to point at this HTTPS origin.",
    )
    args = parser.parse_args()

    errors: list[str] = []
    with zipfile.ZipFile(args.archive) as archive:
        names = set(archive.namelist())
        if "manifest.json" not in names:
            errors.append("manifest.json must be at the archive root")
        else:
            manifest = json.loads(archive.read("manifest.json"))
            if manifest.get("manifest_version") != 3:
                errors.append("manifest_version must be 3")
            if manifest.get("name") != "Suhuang Scroll Bridge":
                errors.append("unexpected extension name")
            if manifest.get("version") != args.version:
                errors.append(f"manifest version {manifest.get('version')!r} != {args.version!r}")
            if not SEMVER.match(str(manifest.get("version", ""))):
                errors.append("manifest version must be three-part semver")
            if len(str(manifest.get("description", ""))) > 132:
                errors.append("description exceeds 132 characters")
            for key, icon in (manifest.get("icons") or {}).items():
                if icon not in names:
                    errors.append(f"missing icon {key}: {icon}")
            side_panel = manifest.get("side_panel") or {}
            if side_panel.get("default_path") not in names:
                errors.append("side_panel.default_path is missing from the archive")
            if args.public_base_url:
                base = args.public_base_url.rstrip("/")
                parsed = urlparse(base)
                if parsed.scheme != "https" or not parsed.netloc or parsed.query or parsed.fragment:
                    errors.append("--public-base-url must be an absolute HTTPS origin/path")
                elif manifest.get("homepage_url") != f"{base}/":
                    errors.append(
                        f"homepage_url {manifest.get('homepage_url')!r} != {base + '/'}"
                    )
        forbidden = [name for name in names if name.endswith(".map") or name.endswith("vite.svg") or name.endswith(".DS_Store")]
        if forbidden:
            errors.append("development artifacts in archive: " + ", ".join(sorted(forbidden)))
        if args.public_base_url:
            public_base = args.public_base_url.rstrip("/").encode("utf-8")
            text_payload = b"\n".join(
                archive.read(name)
                for name in names
                if name.endswith((".js", ".html", ".json"))
            )
            if public_base not in text_payload:
                errors.append("Chrome archive does not contain the configured public site base URL")
            if public_base != b"https://suhuangscroll.com" and b"https://suhuangscroll.com" in text_payload:
                errors.append("Chrome archive still contains the canonical development public URL")
            for suffix in (b"/docs/", b"/privacy/"):
                if suffix not in text_payload:
                    errors.append(
                        f"Chrome archive does not contain the public {suffix.decode().strip('/')} URL"
                    )
        fixture_name = "fixture/synthetic-grading.html"
        if fixture_name not in names:
            errors.append("Chrome archive is missing the synthetic review fixture")
        else:
            fixture = archive.read(fixture_name).decode("utf-8", errors="replace")
            for marker in ('data-suhuang-fixture="true"', 'id="answer-image"', 'id="submit-button"'):
                if marker not in fixture:
                    errors.append(f"Chrome archive fixture is missing marker: {marker}")
        fixture_script_name = "fixture/synthetic-grading.js"
        if fixture_script_name not in names:
            errors.append("Chrome archive is missing the synthetic review fixture script")

    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 1
    print(f"OK: {args.archive} is a Chrome Web Store-shaped MV3 archive")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
