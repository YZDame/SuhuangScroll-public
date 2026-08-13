#!/usr/bin/env python3
"""Verify that the public Runtime repository can serve an installable release."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen


REPOSITORY_PATTERN = re.compile(r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$")
TARGET_ASSETS = (
    "macos-arm64",
    "macos-x64",
    "windows-x64",
    "linux-x64",
)
ROOT = Path(__file__).resolve().parents[2]
PLUGIN_MANIFEST = ROOT / "plugins" / "suhuang-scroll" / ".codex-plugin" / "plugin.json"


def installer_default_matches(installer: str, body: bytes, release_repo: str) -> bool:
    """Require the public repository to be the installer's default source."""
    try:
        text = body.decode("utf-8")
    except UnicodeDecodeError:
        return False
    escaped_repo = re.escape(release_repo)
    if installer.endswith(".sh"):
        return re.search(rf"\bREPO\s*=.*{escaped_repo}(?:[^A-Za-z0-9_.-]|$)", text) is not None
    return re.search(rf"\$Repository\s*=\s*\"{escaped_repo}\"", text) is not None


def fetch(url: str, *, timeout: float) -> tuple[int, bytes]:
    request = Request(url, headers={"user-agent": "SuhuangScroll-release-preflight/1"})
    try:
        with urlopen(request, timeout=timeout) as response:
            return response.status, response.read()
    except HTTPError as error:
        return error.code, error.read()
    except URLError as error:
        raise RuntimeError(f"request failed for {url}: {error.reason}") from error


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--release-repo", required=True, help="Public GitHub YZDame/SuhuangScroll-public.")
    parser.add_argument("--version", required=True, help="Runtime release version, with or without the v prefix.")
    parser.add_argument("--timeout", type=float, default=15.0)
    args = parser.parse_args()

    if not REPOSITORY_PATTERN.fullmatch(args.release_repo):
        print("ERROR: --release-repo must use YZDame/SuhuangScroll-public form", file=sys.stderr)
        return 1
    version = args.version.removeprefix("v")
    if not re.fullmatch(r"\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?", version):
        print("ERROR: --version must be a SemVer-like value", file=sys.stderr)
        return 1

    encoded_repo = quote(args.release_repo, safe="/")
    api_base = f"https://api.github.com/repos/{encoded_repo}"
    errors: list[str] = []

    try:
        status, body = fetch(api_base, timeout=args.timeout)
        metadata = json.loads(body) if status == 200 else {}
    except (RuntimeError, json.JSONDecodeError) as error:
        errors.append(f"repository metadata check failed: {error}")
        metadata = {}
        status = 0
    if status != 200:
        errors.append(f"repository is not anonymously reachable (HTTP {status})")
    if metadata.get("private") is True:
        errors.append("release repository is private")
    if metadata.get("archived") is True:
        errors.append("release repository is archived")

    for installer in ("scripts/install/install.sh", "scripts/install/install.ps1"):
        raw_url = f"https://raw.githubusercontent.com/{args.release_repo}/main/{installer}"
        try:
            status, body = fetch(raw_url, timeout=args.timeout)
        except RuntimeError as error:
            errors.append(f"{installer} check failed: {error}")
            continue
        if status != 200:
            errors.append(f"{installer} is not publicly readable (HTTP {status})")
        elif args.release_repo.encode("utf-8") not in body:
            errors.append(f"{installer} does not name the configured release repository")
        elif not installer_default_matches(installer, body, args.release_repo):
            errors.append(f"{installer} does not use the configured release repository as its default")

    release_url = f"{api_base}/releases/tags/v{version}"
    try:
        status, body = fetch(release_url, timeout=args.timeout)
        release = json.loads(body) if status == 200 else {}
    except (RuntimeError, json.JSONDecodeError) as error:
        errors.append(f"release metadata check failed: {error}")
        release = {}
        status = 0
    if status != 200:
        errors.append(f"Runtime release v{version} is not publicly reachable (HTTP {status})")
    assets = {asset.get("name") for asset in release.get("assets", []) if isinstance(asset, dict)}
    expected_assets = {
        name
        for target in TARGET_ASSETS
        for name in (
            f"Suhuang-v{version}-{target}.zip" if target != "linux-x64" else f"Suhuang-v{version}-{target}.tar.gz",
            f"Suhuang-v{version}-{target}.zip.sha256" if target != "linux-x64" else f"Suhuang-v{version}-{target}.tar.gz.sha256",
        )
    }
    try:
        plugin_version = str(json.loads(PLUGIN_MANIFEST.read_text(encoding="utf-8"))["version"])
    except (OSError, KeyError, TypeError, json.JSONDecodeError) as error:
        errors.append(f"Plugin manifest version check failed: {error}")
        plugin_version = ""
    if plugin_version and not re.fullmatch(r"\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?", plugin_version):
        errors.append(f"Plugin manifest version is not SemVer-like: {plugin_version}")
    if plugin_version:
        expected_assets.update(
            {
                f"SuhuangScroll-CodexPlugin-v{plugin_version}.zip",
                f"SuhuangScroll-CodexPlugin-v{plugin_version}.zip.sha256",
            }
        )
    expected_assets.update(
        {
            f"SuhuangScroll-Bridge-v{version}.zip",
            f"SuhuangScroll-Bridge-v{version}.zip.sha256",
            f"SuhuangScroll-Bridge-ChromeStore-v{version}.zip",
            f"SuhuangScroll-Bridge-ChromeStore-v{version}.zip.sha256",
        }
    )
    missing = sorted(expected_assets - assets)
    if missing:
        errors.append("public release is missing distribution assets: " + ", ".join(missing))

    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 1
    print(f"Public Runtime release: OK ({args.release_repo} v{version})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
