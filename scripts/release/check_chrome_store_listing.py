#!/usr/bin/env python3
"""Validate a generated Chrome Web Store listing worksheet and upload archive."""

from __future__ import annotations

import argparse
import json
import sys
import zipfile
from pathlib import Path
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parents[2]
PLACEHOLDER_HOSTS = {"example.com", "example.org", "example.net", "localhost", "127.0.0.1", "::1"}
FORBIDDEN_FRAGMENTS = ("/Users/", "/private/", "BEGIN PRIVATE KEY", "access_token", "api_key")


def public_base(value: str) -> str:
    parsed = urlparse(value.rstrip("/"))
    host = (parsed.hostname or "").lower()
    if parsed.scheme != "https" or not parsed.netloc or parsed.query or parsed.fragment:
        raise SystemExit("--public-base-url must be an HTTPS origin/path without query or fragment")
    if host in PLACEHOLDER_HOSTS or host.endswith(".local") or host.startswith("your-"):
        raise SystemExit("--public-base-url must use a real public HTTPS host")
    return value.rstrip("/")


def resolve_repo_path(value: str) -> Path:
    path = Path(value).expanduser()
    return path if path.is_absolute() else ROOT / path


def load_json(path: Path, label: str, errors: list[str]) -> dict:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
        errors.append(f"cannot read {label}: {error}")
        return {}
    if not isinstance(value, dict):
        errors.append(f"{label} must be a JSON object")
        return {}
    return value


def check_archive(path: Path, *, base: str, version: str, errors: list[str]) -> None:
    if not path.is_file():
        errors.append(f"Chrome archive does not exist: {path}")
        return
    try:
        archive = zipfile.ZipFile(path)
    except (OSError, zipfile.BadZipFile) as error:
        errors.append(f"invalid Chrome archive: {error}")
        return
    with archive:
        names = set(archive.namelist())
        if "manifest.json" not in names:
            errors.append("Chrome archive is missing root manifest.json")
            return
        try:
            manifest = json.loads(archive.read("manifest.json"))
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            errors.append(f"Chrome archive manifest is invalid JSON: {error}")
            return
        if manifest.get("manifest_version") != 3:
            errors.append("Chrome archive manifest_version must be 3")
        if manifest.get("name") != "Suhuang Scroll Bridge":
            errors.append("Chrome archive name must be Suhuang Scroll Bridge")
        if manifest.get("version") != version:
            errors.append(f"Chrome archive version {manifest.get('version')!r} != worksheet version {version!r}")
        if manifest.get("homepage_url") != f"{base}/":
            errors.append("Chrome archive homepage_url does not match the public base URL")
        forbidden = [name for name in names if name.endswith(".map") or name.endswith("vite.svg") or ".DS_Store" in name]
        if forbidden:
            errors.append("Chrome archive contains development artifacts: " + ", ".join(sorted(forbidden)))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("worksheet")
    parser.add_argument("--public-base-url", required=True)
    parser.add_argument("--require-package", action="store_true")
    args = parser.parse_args()

    base = public_base(args.public_base_url)
    errors: list[str] = []
    worksheet = load_json(Path(args.worksheet).expanduser(), "Chrome listing worksheet", errors)
    manifest = load_json(ROOT / "extension/manifest.json", "source extension manifest", errors)

    expected_urls = {
        "websiteUrl": f"{base}/",
        "privacyPolicyUrl": f"{base}/privacy/",
        "termsOfServiceUrl": f"{base}/terms/",
        "supportUrl": f"{base}/support/",
    }
    for field, expected in expected_urls.items():
        if worksheet.get(field) != expected:
            errors.append(f"worksheet.{field} must be {expected}")

    if worksheet.get("name") != manifest.get("name"):
        errors.append("worksheet.name must match extension/manifest.json")
    short_description = worksheet.get("shortDescription")
    if not isinstance(short_description, str) or not short_description.strip():
        errors.append("worksheet.shortDescription must be non-empty")
    elif len(short_description) > 132:
        errors.append("worksheet.shortDescription exceeds Chrome's 132-character limit")
    if not isinstance(worksheet.get("detailedDescription"), str) or not worksheet["detailedDescription"].strip():
        errors.append("worksheet.detailedDescription must be non-empty")

    expected_permissions = set(manifest.get("permissions", []))
    listed_permissions = worksheet.get("permissions")
    if not isinstance(listed_permissions, list):
        errors.append("worksheet.permissions must be a list")
    else:
        listed_names = set()
        for item in listed_permissions:
            if not isinstance(item, dict) or not isinstance(item.get("name"), str):
                errors.append("each worksheet permission must contain a name")
                continue
            listed_names.add(item["name"])
            if not isinstance(item.get("justification"), str) or not item["justification"].strip():
                errors.append(f"permission {item['name']} is missing a justification")
        for missing in sorted(expected_permissions - listed_names):
            errors.append(f"worksheet.permissions is missing {missing}")

    expected_hosts = set(manifest.get("host_permissions", []))
    listed_hosts = worksheet.get("hostPermissions")
    if not isinstance(listed_hosts, list):
        errors.append("worksheet.hostPermissions must be a list")
    else:
        listed_patterns = set()
        for item in listed_hosts:
            if not isinstance(item, dict) or not isinstance(item.get("pattern"), str):
                errors.append("each worksheet host permission must contain a pattern")
                continue
            listed_patterns.add(item["pattern"])
            if not isinstance(item.get("justification"), str) or not item["justification"].strip():
                errors.append(f"host permission {item['pattern']} is missing a justification")
        for missing in sorted(expected_hosts - listed_patterns):
            errors.append(f"worksheet.hostPermissions is missing {missing}")

    assets = worksheet.get("graphicAssets")
    if not isinstance(assets, dict):
        errors.append("worksheet.graphicAssets must be an object")
    else:
        for key in ("icon", "screenshot", "smallPromoTile"):
            value = assets.get(key)
            if not isinstance(value, str) or not resolve_repo_path(value).is_file():
                errors.append(f"worksheet graphic asset {key} is missing: {value}")

    privacy = worksheet.get("privacyPractices")
    if not isinstance(privacy, dict):
        errors.append("worksheet.privacyPractices must be an object")
    else:
        for key in ("singlePurpose", "use", "sharing", "retention"):
            if not isinstance(privacy.get(key), str) or not privacy[key].strip():
                errors.append(f"privacyPractices.{key} must be non-empty")
        if not isinstance(privacy.get("dataHandled"), list) or not privacy["dataHandled"]:
            errors.append("privacyPractices.dataHandled must be a non-empty list")
        if privacy.get("manualDashboardCertificationRequired") is not True:
            errors.append("privacyPractices.manualDashboardCertificationRequired must be true")

    package = worksheet.get("package")
    if args.require_package and not isinstance(package, dict):
        errors.append("worksheet.package is required for a public candidate")
    if isinstance(package, dict):
        archive_value = package.get("archive")
        if not isinstance(archive_value, str) or not archive_value.strip():
            errors.append("worksheet.package.archive must be a path")
        else:
            version = str(worksheet.get("version", ""))
            check_archive(resolve_repo_path(archive_value), base=base, version=version, errors=errors)
        if package.get("manifestVersion") != 3:
            errors.append("worksheet.package.manifestVersion must be 3")
        if package.get("version") != worksheet.get("version"):
            errors.append("worksheet.package.version must match worksheet.version")

    sanitized = json.loads(json.dumps(worksheet, ensure_ascii=False))
    if isinstance(sanitized.get("package"), dict):
        sanitized["package"]["archive"] = "<archive>"
    serialized = json.dumps(sanitized, ensure_ascii=False)
    for fragment in FORBIDDEN_FRAGMENTS:
        if fragment in serialized:
            errors.append(f"worksheet contains forbidden fragment: {fragment}")

    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 1
    print(f"Chrome Store listing worksheet: OK ({args.worksheet})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
