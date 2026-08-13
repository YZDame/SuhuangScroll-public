#!/usr/bin/env python3
"""Validate the repository-scoped Codex Plugin marketplace catalog."""

from __future__ import annotations

import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
MARKETPLACE = ROOT / ".agents/plugins/marketplace.json"


def main() -> int:
    errors: list[str] = []
    if not MARKETPLACE.exists():
        errors.append("missing .agents/plugins/marketplace.json")
    else:
        try:
            catalog = json.loads(MARKETPLACE.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as error:
            errors.append(f"invalid marketplace JSON: {error}")
            catalog = {}

        if catalog.get("name") != "suhuang-scroll":
            errors.append("marketplace name must be suhuang-scroll")
        plugins = catalog.get("plugins")
        if not isinstance(plugins, list) or not plugins:
            errors.append("marketplace plugins must be a non-empty array")
        else:
            entry = next((item for item in plugins if item.get("name") == "suhuang-scroll"), None)
            if entry is None:
                errors.append("marketplace must include the suhuang-scroll plugin")
            else:
                source = entry.get("source") or {}
                source_path = source.get("path")
                if source.get("source") != "local" or source_path != "./plugins/suhuang-scroll":
                    errors.append("suhuang-scroll must use the repository-relative local source path")
                if (entry.get("policy") or {}).get("installation") != "AVAILABLE":
                    errors.append("suhuang-scroll installation policy must be AVAILABLE")
                manifest_path = ROOT / "plugins/suhuang-scroll/.codex-plugin/plugin.json"
                if not manifest_path.exists():
                    errors.append("marketplace plugin manifest is missing")
                else:
                    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
                    if manifest.get("name") != "suhuang-scroll":
                        errors.append("marketplace plugin manifest name mismatch")

    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 1
    print("Codex repo marketplace: OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
