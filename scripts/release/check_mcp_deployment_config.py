#!/usr/bin/env python3
"""Validate production Hosted MCP environment settings without printing secrets."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from urllib.parse import urlparse


REQUIRED_HTTPS = (
    "SUHUANG_MCP_RESOURCE",
    "SUHUANG_RESOURCE_DOCUMENTATION",
    "SUHUANG_OAUTH_ISSUER",
    "SUHUANG_OAUTH_JWKS_URL",
)


def read_env_file(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for line_number, raw_line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[7:].lstrip()
        if "=" not in line:
            raise ValueError(f"line {line_number} is not KEY=VALUE")
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()
        if not key or any(character.isspace() for character in key):
            raise ValueError(f"line {line_number} has an invalid environment key")
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
            value = value[1:-1]
        values[key] = value
    return values


def require_https(values: dict[str, str], key: str, errors: list[str]) -> None:
    value = values.get(key, "").strip()
    if not value:
        errors.append(f"{key} is required")
        return
    parsed = urlparse(value)
    if parsed.scheme != "https" or not parsed.netloc or parsed.query or parsed.fragment:
        errors.append(f"{key} must be an HTTPS URL without query or fragment")


def parse_json_object(values: dict[str, str], key: str, errors: list[str]) -> dict[str, str] | None:
    raw = values.get(key, "").strip()
    if not raw:
        errors.append(f"{key} is required when review fixture mode is enabled")
        return None
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        errors.append(f"{key} must be a JSON object")
        return None
    if not isinstance(parsed, dict) or not parsed:
        errors.append(f"{key} must be a non-empty JSON object")
        return None
    if not all(
        isinstance(token, str) and token.strip() and isinstance(tenant, str) and tenant.strip()
        for token, tenant in parsed.items()
    ):
        errors.append(f"{key} must map non-empty token strings to non-empty tenant strings")
        return None
    return {str(token): str(tenant).strip() for token, tenant in parsed.items()}


def validate(values: dict[str, str]) -> list[str]:
    errors: list[str] = []
    for key in REQUIRED_HTTPS:
        require_https(values, key, errors)

    if not values.get("SUHUANG_OAUTH_AUDIENCE", "").strip():
        errors.append("SUHUANG_OAUTH_AUDIENCE is required")

    scopes = set(values.get("SUHUANG_OAUTH_SCOPE", "").replace(",", " ").split())
    if "suhuang:runtime" not in scopes:
        errors.append("SUHUANG_OAUTH_SCOPE must include suhuang:runtime")

    origins = values.get("SUHUANG_ALLOWED_ORIGINS", "").replace(",", " ").split()
    for origin in origins:
        parsed = urlparse(origin)
        if origin == "*" or parsed.scheme != "https" or not parsed.netloc or parsed.path not in {"", "/"} or parsed.query or parsed.fragment:
            errors.append("SUHUANG_ALLOWED_ORIGINS must contain only exact HTTPS origins (never * or localhost)")
            break

    review_mode = values.get("SUHUANG_MCP_REVIEW_MODE", "").strip().lower()
    review_tenants = set(values.get("SUHUANG_MCP_REVIEW_TENANTS", "").replace(",", " ").split())
    if review_mode not in {"", "fixture"}:
        errors.append("SUHUANG_MCP_REVIEW_MODE must be empty or fixture")
    elif review_mode == "fixture":
        if not review_tenants:
            errors.append("SUHUANG_MCP_REVIEW_TENANTS is required in fixture mode")
        if "default" in review_tenants:
            errors.append("review fixture tenants must not include default")
        token_map = parse_json_object(values, "SUHUANG_MCP_TOKENS_JSON", errors)
        if token_map and not set(token_map.values()).issubset(review_tenants):
            errors.append("every static MCP token tenant must be explicitly listed in SUHUANG_MCP_REVIEW_TENANTS")
    else:
        if review_tenants:
            errors.append("SUHUANG_MCP_REVIEW_TENANTS is set but SUHUANG_MCP_REVIEW_MODE is not fixture")
        if values.get("SUHUANG_MCP_TOKEN", "").strip() or values.get("SUHUANG_MCP_TOKENS_JSON", "").strip():
            errors.append("public production config must use OAuth for MCP; static MCP tokens are allowed only for isolated fixture mode")

    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--env-file", type=Path, required=True, help="Deployment env file; values are never printed.")
    args = parser.parse_args()
    try:
        values = read_env_file(args.env_file.expanduser().resolve())
    except (OSError, ValueError) as error:
        print(f"ERROR: cannot read deployment env file: {error}", file=sys.stderr)
        return 1

    errors = validate(values)
    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 1
    print("Hosted MCP production config: OK (secrets not displayed)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
