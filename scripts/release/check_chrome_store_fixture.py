#!/usr/bin/env python3
"""Check the deterministic Chrome review fixture shipped with the extension."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
FIXTURE = ROOT / "extension" / "public" / "fixture" / "synthetic-grading.html"
SOURCE_MARKERS = {
    "extension/src/adapters/synthetic/match.ts": (
        "SYNTHETIC_FIXTURE_PATH",
        "localhost",
        "127.0.0.1",
    ),
    "extension/src/adapters/synthetic/index.ts": (
        "SyntheticReviewAdapter",
        "Synthetic review fixture",
        "Synthetic dry-run",
    ),
    "extension/src/content/index.ts": (
        "SYNTHETIC_VALIDATION_DESCRIPTORS",
        "getSyntheticPageContext",
        "isSyntheticFixtureUrl",
    ),
    "extension/src/background/index.ts": (
        "isDryRunInput",
        "requiresActivatedCore(message.action, message.input)",
    ),
}
FIXTURE_MARKERS = (
    'data-suhuang-fixture="true"',
    'id="answer-image"',
    'id="score-input"',
    'id="submit-button"',
    'id="next-item"',
    'data-batch-score="0"',
    'src="synthetic-grading.js"',
)
FIXTURE_SCRIPT_MARKERS = (
    "Synthetic submit clicked",
    "synthetic answer image",
    "dataset.syntheticSubmitted",
    "no network request",
)
FORBIDDEN_FIXTURE_FRAGMENTS = (
    "fetch(",
    "XMLHttpRequest",
    "navigator.sendBeacon",
)


def check_tree_fixture(path: Path, errors: list[str], label: str) -> None:
    if not path.is_file():
        errors.append(f"missing fixture: {label}")
        return
    text = path.read_text(encoding="utf-8")
    for marker in FIXTURE_MARKERS:
        if marker not in text:
            errors.append(f"{label} is missing marker: {marker}")
    for fragment in FORBIDDEN_FIXTURE_FRAGMENTS:
        if fragment.lower() in text.lower():
            errors.append(f"{label} contains a network-capable fragment: {fragment}")


def check_fixture_script(path: Path, errors: list[str], label: str) -> None:
    if not path.is_file():
        errors.append(f"missing fixture script: {label}")
        return
    text = path.read_text(encoding="utf-8")
    for marker in FIXTURE_SCRIPT_MARKERS:
        if marker not in text:
            errors.append(f"{label} is missing marker: {marker}")
    for fragment in FORBIDDEN_FIXTURE_FRAGMENTS:
        if fragment.lower() in text.lower():
            errors.append(f"{label} contains a network-capable fragment: {fragment}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--dist-dir",
        type=Path,
        help="Optional built extension directory whose fixture should also be checked.",
    )
    args = parser.parse_args()

    errors: list[str] = []
    check_tree_fixture(FIXTURE, errors, str(FIXTURE.relative_to(ROOT)))
    check_fixture_script(FIXTURE.with_name("synthetic-grading.js"), errors, "extension/public/fixture/synthetic-grading.js")
    if args.dist_dir:
        dist_fixture = (ROOT / args.dist_dir / "fixture" / "synthetic-grading.html").resolve()
        check_tree_fixture(dist_fixture, errors, str(dist_fixture.relative_to(ROOT)))
        check_fixture_script(dist_fixture.with_name("synthetic-grading.js"), errors, str(dist_fixture.with_name("synthetic-grading.js").relative_to(ROOT)))

    for relative, markers in SOURCE_MARKERS.items():
        path = ROOT / relative
        if not path.is_file():
            errors.append(f"missing fixture source: {relative}")
            continue
        text = path.read_text(encoding="utf-8")
        for marker in markers:
            if marker not in text:
                errors.append(f"{relative} is missing fixture marker: {marker}")

    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 1
    print("Chrome synthetic review fixture: OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
