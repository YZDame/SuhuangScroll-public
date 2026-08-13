#!/usr/bin/env python3
"""Validate the public GitHub distribution contract for Suhuang Scroll."""

from __future__ import annotations

import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
MARKETPLACE = ROOT / ".agents/plugins/marketplace.json"
MANIFEST = ROOT / "plugins/suhuang-scroll/.codex-plugin/plugin.json"
DOC = ROOT / "docs/plugin-distribution.md"


def main() -> int:
    errors: list[str] = []

    for path, label in (
        (MARKETPLACE, ".agents/plugins/marketplace.json"),
        (MANIFEST, "Plugin manifest"),
        (DOC, "distribution documentation"),
    ):
        if not path.is_file():
            errors.append(f"missing {label}: {path.relative_to(ROOT)}")

    if MARKETPLACE.is_file():
        try:
            catalog = json.loads(MARKETPLACE.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as error:
            errors.append(f"invalid marketplace JSON: {error}")
        else:
            if catalog.get("name") != "suhuang-scroll":
                errors.append("marketplace name must be suhuang-scroll")
            entries = catalog.get("plugins")
            entry = next(
                (item for item in entries or [] if item.get("name") == "suhuang-scroll"),
                None,
            )
            if entry is None:
                errors.append("marketplace must expose the suhuang-scroll plugin")
            else:
                source = entry.get("source") or {}
                if source.get("source") != "local" or source.get("path") != "./plugins/suhuang-scroll":
                    errors.append("marketplace entry must point at ./plugins/suhuang-scroll")
                policy = entry.get("policy") or {}
                if policy.get("installation") != "AVAILABLE":
                    errors.append("marketplace installation policy must be AVAILABLE")
                if policy.get("authentication") != "ON_INSTALL":
                    errors.append("marketplace authentication policy must be ON_INSTALL")

    if MANIFEST.is_file():
        try:
            manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as error:
            errors.append(f"invalid Plugin manifest: {error}")
        else:
            if manifest.get("name") != "suhuang-scroll":
                errors.append("Plugin manifest name must be suhuang-scroll")
            if not manifest.get("skills"):
                errors.append("Plugin manifest must expose Skills")
            if not manifest.get("mcpServers"):
                errors.append("Plugin manifest must expose the local MCP bridge")

    if DOC.is_file():
        text = DOC.read_text(encoding="utf-8")
        required_fragments = (
            "codex plugin marketplace add YZDame/SuhuangScroll-public --ref main",
            "codex plugin marketplace upgrade suhuang-scroll",
            "suhuang doctor --format json",
            "Chrome Web Store",
            "Hosted MCP",
            "Common faults",
        )
        for fragment in required_fragments:
            if fragment not in text:
                errors.append(f"distribution documentation is missing: {fragment}")

    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 1

    print("Distribution surface: OK (GitHub marketplace, Releases, Chrome Web Store, Hosted MCP)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
