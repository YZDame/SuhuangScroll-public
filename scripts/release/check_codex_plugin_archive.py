#!/usr/bin/env python3
"""Validate a public Codex Plugin archive and optional developer wiring."""

from __future__ import annotations

import argparse
import json
import re
import sys
import zipfile
from pathlib import PurePosixPath
from urllib.parse import urlparse


APP_ID_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{5,}$")
REPOSITORY_PATTERN = re.compile(r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$")
PLACEHOLDER_WORDS = ("todo", "placeholder", "example", "your-app", "replace")
PRIVATE_SOURCE_REPOSITORY = "YZDame/" + "SuhuangScroll"


def validate_base(value: str) -> str:
    parsed = urlparse(value.rstrip("/"))
    hostname = (parsed.hostname or "").lower()
    if parsed.scheme != "https" or not parsed.netloc or parsed.query or parsed.fragment:
        raise SystemExit("--public-base-url must be an HTTPS origin/path without query or fragment")
    if hostname in {"localhost", "127.0.0.1", "::1", "example.com", "example.org", "example.net"}:
        raise SystemExit("--public-base-url must be a real public HTTPS origin")
    if hostname.endswith(".local") or hostname.startswith("your-"):
        raise SystemExit("--public-base-url must not use a development or placeholder host")
    return value.rstrip("/")


def load_json(archive: zipfile.ZipFile, name: str, errors: list[str]):
    try:
        return json.loads(archive.read(name).decode("utf-8"))
    except KeyError:
        errors.append(f"archive is missing {name}")
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        errors.append(f"invalid JSON in {name}: {error}")
    return {}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive")
    parser.add_argument("--public-base-url", required=True)
    parser.add_argument("--release-repo", help="Expected public YZDame/SuhuangScroll-public used by installer instructions.")
    parser.add_argument("--require-app-id", action="store_true")
    args = parser.parse_args()

    base = validate_base(args.public_base_url)
    errors: list[str] = []
    if args.release_repo and not REPOSITORY_PATTERN.fullmatch(args.release_repo):
        errors.append("--release-repo must use YZDame/SuhuangScroll-public form")
    if args.release_repo == PRIVATE_SOURCE_REPOSITORY:
        errors.append("--release-repo must be a separate public Runtime repository")
    try:
        archive = zipfile.ZipFile(args.archive)
    except (OSError, zipfile.BadZipFile) as error:
        print(f"ERROR: invalid archive: {error}", file=sys.stderr)
        return 1

    with archive:
        names = set(archive.namelist())
        forbidden = [name for name in names if ".DS_Store" in PurePosixPath(name).parts]
        if forbidden:
            errors.append("archive contains macOS metadata: " + ", ".join(sorted(forbidden)))

        manifest = load_json(archive, ".codex-plugin/plugin.json", errors)
        if not isinstance(manifest, dict):
            errors.append("plugin manifest must be a JSON object")
            manifest = {}
        if manifest.get("name") != "suhuang-scroll":
            errors.append("manifest name must be suhuang-scroll")
        apps_reference = manifest.get("apps")
        if apps_reference is not None and apps_reference != "./.app.json":
            errors.append("manifest apps, when present, must point to ./.app.json")
        if manifest.get("mcpServers") != "./.mcp.json":
            errors.append("manifest mcpServers must point to ./.mcp.json")
        if manifest.get("homepage") != f"{base}/":
            errors.append(f"manifest homepage must be {base}/")

        interface = manifest.get("interface") if isinstance(manifest.get("interface"), dict) else {}
        expected_urls = {
            "websiteURL": base,
            "privacyPolicyURL": f"{base}/privacy/",
            "termsOfServiceURL": f"{base}/terms/",
        }
        for field, expected in expected_urls.items():
            if interface.get(field) != expected:
                errors.append(f"interface.{field} must be {expected}")

        if args.require_app_id and ".app.json" not in names:
            errors.append("developer-mode archive is missing .app.json")
        elif ".app.json" in names:
            if manifest.get("apps") != "./.app.json":
                errors.append("archive .app.json must be wired through manifest apps")
            app_manifest = load_json(archive, ".app.json", errors)
            if not isinstance(app_manifest, dict):
                errors.append(".app.json must be a JSON object")
                app_manifest = {}
            apps = app_manifest.get("apps") if isinstance(app_manifest, dict) else None
            if not isinstance(apps, dict) or not apps:
                errors.append(".app.json must define at least one app mapping")
            elif args.require_app_id:
                app_ids = [value.get("id") for value in apps.values() if isinstance(value, dict)]
                if not app_ids or any(
                    not isinstance(app_id, str)
                    or not APP_ID_PATTERN.fullmatch(app_id)
                    or any(word in app_id.lower() for word in PLACEHOLDER_WORDS)
                    for app_id in app_ids
                ):
                    errors.append(".app.json must contain a real registered app ID")

        if args.require_app_id and manifest.get("apps") != "./.app.json":
            errors.append("developer-mode manifest apps must point to ./.app.json")

        for required in (".mcp.json", "README.md", "assets/logo.png", "assets/composer-icon.png"):
            if required not in names:
                errors.append(f"public archive is missing {required}")

        if args.release_repo:
            expected_installer = f"raw.githubusercontent.com/{args.release_repo}/main/scripts/install/install.sh"
            expected_repo_args = (
                f"--repo {args.release_repo}",
                f"-Repository {args.release_repo}",
            )
            installer_text_found = False
            repo_argument_found = False
            private_repo_pattern = re.compile(
                rf"(?:github\.com|raw\.githubusercontent\.com)/{re.escape(PRIVATE_SOURCE_REPOSITORY)}"
                rf"(?:[^A-Za-z0-9_.-]|$)"
            )
            for name in names:
                if not name.endswith((".md", ".mjs", ".json", ".yaml", ".yml", ".txt")):
                    continue
                payload = archive.read(name)
                try:
                    text = payload.decode("utf-8")
                except UnicodeDecodeError:
                    continue
                if private_repo_pattern.search(text):
                    errors.append(f"archive contains a private source-repository URL in {name}")
                if expected_installer in text:
                    installer_text_found = True
                if any(argument in text for argument in expected_repo_args):
                    repo_argument_found = True
            if not installer_text_found:
                errors.append("archive does not contain the expected public Runtime installer URL")
            if not repo_argument_found:
                errors.append("archive does not pass the configured public Runtime repository to the installer")

    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 1
    print(f"Codex public Plugin archive: OK ({args.archive})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
