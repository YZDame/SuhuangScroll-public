#!/usr/bin/env python3
"""Validate a generated Codex Plugin submission worksheet."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path
from urllib.parse import urlparse


APP_ID_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{5,}$")
REPOSITORY_PATTERN = re.compile(r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$")
PLACEHOLDER_WORDS = ("todo", "placeholder", "example", "your-app", "replace")


def normalize_https(value: str, label: str, *, required_path: str | None = None) -> str:
    parsed = urlparse(value.rstrip("/"))
    host = (parsed.hostname or "").lower()
    if parsed.scheme != "https" or not parsed.netloc or parsed.query or parsed.fragment:
        raise SystemExit(f"{label} must be an HTTPS URL without query or fragment")
    if host in {"localhost", "127.0.0.1", "::1", "example.com", "example.org", "example.net"}:
        raise SystemExit(f"{label} must use a real public host")
    if host.endswith(".local") or host.startswith("your-"):
        raise SystemExit(f"{label} must not use a development or placeholder host")
    if required_path is not None and parsed.path.rstrip("/") != required_path.rstrip("/"):
        raise SystemExit(f"{label} path must be {required_path}")
    return value.rstrip("/")


def digest(path: Path) -> str:
    sha = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            sha.update(chunk)
    return sha.hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("worksheet")
    parser.add_argument("--public-base-url", required=True)
    parser.add_argument("--mcp-url", required=True)
    parser.add_argument("--release-repo", required=True, help="Public YZDame/SuhuangScroll-public hosting Runtime release binaries.")
    parser.add_argument("--require-package", action="store_true")
    args = parser.parse_args()

    base = normalize_https(args.public_base_url, "--public-base-url")
    mcp = normalize_https(args.mcp_url, "--mcp-url", required_path="/mcp")
    errors: list[str] = []
    if not REPOSITORY_PATTERN.fullmatch(args.release_repo):
        errors.append("--release-repo must use YZDame/SuhuangScroll-public form")
    if args.release_repo == "YZDame/" + "SuhuangScroll":
        errors.append("--release-repo must be a separate public Runtime repository")
    path = Path(args.worksheet)
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
        print(f"ERROR: cannot read worksheet: {error}", file=sys.stderr)
        return 1

    if not isinstance(data, dict):
        errors.append("worksheet must be a JSON object")
        data = {}

    if data.get("runtimeReleaseRepository") != args.release_repo:
        errors.append(f"runtimeReleaseRepository must be {args.release_repo}")
    if data.get("schemaVersion") != "suhuang.codex-plugin-submission.v2":
        errors.append("schemaVersion must be suhuang.codex-plugin-submission.v2")

    listing = data.get("listing") if isinstance(data.get("listing"), dict) else {}
    expected_listing_urls = {
        "websiteURL": f"{base}/",
        "supportURL": f"{base}/support/",
        "privacyPolicyURL": f"{base}/privacy/",
        "termsOfServiceURL": f"{base}/terms/",
    }
    for field, expected in expected_listing_urls.items():
        if listing.get(field) != expected:
            errors.append(f"listing.{field} must be {expected}")
    for field in ("name", "shortDescription", "longDescription", "developerName", "category", "logo", "composerIcon"):
        if not isinstance(listing.get(field), str) or not listing[field].strip():
            errors.append(f"listing.{field} must be non-empty text")

    prompts = data.get("starterPrompts")
    if not isinstance(prompts, list) or not 1 <= len(prompts) <= 3:
        errors.append("starterPrompts must contain between 1 and 3 prompts")
    elif any(not isinstance(prompt, str) or not prompt.strip() or len(prompt) > 128 for prompt in prompts):
        errors.append("starterPrompts entries must be non-empty strings of at most 128 characters")

    mcp_data = data.get("mcp") if isinstance(data.get("mcp"), dict) else {}
    if mcp_data.get("connectionType") != "Universal":
        errors.append("mcp.connectionType must be Universal")
    if mcp_data.get("serverURL") != mcp:
        errors.append(f"mcp.serverURL must be {mcp}")
    if mcp_data.get("resource") != mcp.rsplit("/mcp", 1)[0]:
        errors.append("mcp.resource must be the Hosted MCP origin")
    if mcp_data.get("authentication") != "OAuth 2.1 with PKCE (S256)":
        errors.append("mcp.authentication must document OAuth 2.1 with PKCE (S256)")
    scopes = mcp_data.get("scopes")
    if not isinstance(scopes, list) or "suhuang:runtime" not in scopes:
        errors.append("mcp.scopes must include suhuang:runtime")
    expected_challenge = f"{mcp.rsplit('/mcp', 1)[0]}/.well-known/openai-apps-challenge"
    if mcp_data.get("domainChallengeURL") != expected_challenge:
        errors.append(f"mcp.domainChallengeURL must be {expected_challenge}")
    connection_id = mcp_data.get("developerModeConnectionId")
    if connection_id is not None and (
        not isinstance(connection_id, str)
        or not APP_ID_PATTERN.fullmatch(connection_id)
        or any(word in connection_id.lower() for word in PLACEHOLDER_WORDS)
    ):
        errors.append("mcp.developerModeConnectionId must be a real registered connection ID when present")

    skills = data.get("skills")
    if not isinstance(skills, list) or not skills:
        errors.append("skills must contain at least one skill entry")
    elif any(
        not isinstance(skill, dict)
        or not isinstance(skill.get("name"), str)
        or not skill["name"].strip()
        or not isinstance(skill.get("path"), str)
        or not skill["path"].strip()
        for skill in skills
    ):
        errors.append("skills entries must contain non-empty name and path text")

    cases = data.get("testCases") if isinstance(data.get("testCases"), dict) else {}
    for label, expected_count in (("positive", 5), ("negative", 3)):
        values = cases.get(label)
        if not isinstance(values, list) or len(values) != expected_count:
            errors.append(f"testCases.{label} must contain exactly {expected_count} cases")
            continue
        for index, case in enumerate(values):
            required_case_fields = ("id", "prompt", "expected", "expectedResultShape", "fixture")
            if not isinstance(case, dict) or not all(
                isinstance(case.get(key), str) and case[key].strip() for key in required_case_fields
            ):
                errors.append(
                    f"testCases.{label}[{index}] must contain id, prompt, expected, expectedResultShape, and fixture text"
                )
            if label == "negative" and (
                not isinstance(case, dict)
                or not isinstance(case.get("whyNotComplete"), str)
                or not case["whyNotComplete"].strip()
            ):
                errors.append(f"testCases.negative[{index}] must contain whyNotComplete text")

    availability = data.get("availability")
    countries = availability.get("countriesOrRegions") if isinstance(availability, dict) else None
    if not isinstance(countries, list) or not countries or any(not isinstance(country, str) or not country.strip() for country in countries):
        errors.append("availability.countriesOrRegions must contain at least one non-empty country or region")
    if not isinstance(data.get("releaseNotes"), str) or not data["releaseNotes"].strip():
        errors.append("releaseNotes must be non-empty text")

    package = data.get("package")
    if args.require_package and not isinstance(package, dict):
        errors.append("package metadata is required")
    if isinstance(package, dict):
        archive = Path(str(package.get("archive", ""))).expanduser()
        expected_hash = package.get("sha256")
        if not archive.is_file():
            errors.append(f"package archive does not exist: {archive}")
        elif not isinstance(expected_hash, str) or digest(archive) != expected_hash:
            errors.append("package.sha256 does not match the package archive")

    serialized = json.dumps(data, ensure_ascii=False)
    for forbidden in ("BEGIN PRIVATE KEY", "api_key", "access_token", "pairingCode"):
        if forbidden.lower() in serialized.lower():
            errors.append(f"worksheet contains forbidden credential material: {forbidden}")

    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 1
    print(f"Codex submission worksheet: OK ({path})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
