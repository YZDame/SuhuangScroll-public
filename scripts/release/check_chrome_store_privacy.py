#!/usr/bin/env python3
"""Check the Chrome extension's user-data consent and disclosure boundary."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


REQUIRED_SOURCE_MARKERS = {
    "extension/src/sidepanel.ts": (
        "dataNotice",
        "DATA_CONSENT_STORAGE_KEY",
        "ensureDataConsent",
        "privacyPolicyLink",
        "dataConsentInput",
    ),
    "extension/src/background/index.ts": (
        "DATA_CONSENT_STORAGE_KEY",
        "requiresDataConsent",
        "handleGetImage",
        "handleGradeRequest",
        "inspecting a grading page",
        "stopAutomationAfterConsentRevoked",
        "isDryRunInput",
    ),
    "extension/src/content/index.ts": (
        "syncImageObserverWithConsent",
        "syncAutomationHeartbeatWithConsent",
        "stopAutomationHeartbeat",
        "CONSENT_REQUIRED_CONTENT_MESSAGES",
        "Data consent is required before accessing grading-page data",
        "startImageObserver",
        "DATA_CONSENT_STORAGE_KEY",
    ),
    "extension/src/content/observer.ts": (
        "MutationObserver",
        "return () =>",
    ),
    "extension/src/privacy-consent.ts": (
        "suhuangDataConsentAccepted",
        "chrome.storage.local.get",
    ),
    "extension/store/privacy-policy.md": (
        "affirmative consent",
        "does not read",
        "grading-page heartbeats",
        "consent is revoked",
    ),
    "site/privacy/index.html": (
        "affirmative operator consent",
        "does not read answer images",
        "grading-page heartbeats",
        "consent stops page observation",
    ),
}

FORBIDDEN_SOURCE_SNIPPETS = {
    "extension/src/background/index.ts": (
        "console.log('[agentic-grading] Message received:', message,",
        "console.log('[agentic-grading] Message received:', message, 'from:', sender",
    ),
}


def check_source(errors: list[str]) -> None:
    for relative, markers in REQUIRED_SOURCE_MARKERS.items():
        path = ROOT / relative
        try:
            text = path.read_text(encoding="utf-8")
        except OSError as error:
            errors.append(f"cannot read {relative}: {error}")
            continue
        normalized = " ".join(text.lower().split())
        for marker in markers:
            if marker.lower() not in normalized:
                errors.append(f"{relative} is missing privacy marker: {marker}")

    for relative, snippets in FORBIDDEN_SOURCE_SNIPPETS.items():
        path = ROOT / relative
        try:
            text = path.read_text(encoding="utf-8")
        except OSError:
            continue
        for snippet in snippets:
            if snippet in text:
                errors.append(f"{relative} logs sensitive message data before the consent boundary: {snippet}")


def check_dist(dist_dir: Path, errors: list[str]) -> None:
    if not dist_dir.exists():
        return
    bundles = sorted(dist_dir.rglob("*.js"))
    if not bundles:
        errors.append(f"built extension has no JavaScript bundles: {dist_dir}")
        return
    bundle_text = "\n".join(path.read_text(encoding="utf-8") for path in bundles)
    for marker in ("suhuangDataConsentAccepted", "Data consent is required"):
        if marker not in bundle_text:
            errors.append(f"built extension bundle is missing privacy marker: {marker}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--dist-dir",
        default="extension/dist",
        help="Optional built extension directory to inspect in addition to source.",
    )
    args = parser.parse_args()

    errors: list[str] = []
    check_source(errors)
    check_dist(ROOT / args.dist_dir, errors)
    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 1
    print("Chrome Store privacy boundary: OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
