#!/usr/bin/env python3
"""Check that the public schema bundle is present and internally readable.

This intentionally uses only the standard library. Full JSON Schema validation
belongs in consumer test suites; the release check catches malformed files,
missing version roots, and accidental private/runtime data in the public tree.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SCHEMA_ROOT = ROOT / "schemas"
EXPECTED = {
    "question-spec/v1.schema.json": "Suhuang Scroll Question Spec v1",
    "grading-decision/v1.schema.json": "Suhuang Scroll Grading Decision v1",
    "run-events/v1.schema.json": "Suhuang Scroll Run Event v1",
    "adapter-contract/v1.schema.json": "Suhuang Scroll Adapter Contract v1",
}


def main() -> int:
    errors: list[str] = []
    for relative_path, title in EXPECTED.items():
        path = SCHEMA_ROOT / relative_path
        if not path.exists():
            errors.append(f"missing schema: {relative_path}")
            continue
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as error:
            errors.append(f"invalid JSON in {relative_path}: {error}")
            continue
        if payload.get("$schema") != "https://json-schema.org/draft/2020-12/schema":
            errors.append(f"{relative_path}: expected Draft 2020-12 declaration")
        if payload.get("title") != title:
            errors.append(f"{relative_path}: unexpected title")
        if payload.get("type") != "object":
            errors.append(f"{relative_path}: root must be an object schema")
        if payload.get("additionalProperties") is not False:
            errors.append(f"{relative_path}: root must close unknown fields")

    forbidden_parts = {"workspace/runs", "workspace/data", ".env", "cookies", "transcript"}
    for path in SCHEMA_ROOT.rglob("*"):
        if not path.is_file():
            continue
        normalized = path.as_posix()
        if any(part in normalized for part in forbidden_parts):
            errors.append(f"private/runtime path appears under schemas: {normalized}")

    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 1
    print(f"OK: {len(EXPECTED)} public schema files are readable")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
