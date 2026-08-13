#!/usr/bin/env python3
"""Create a Chrome Web Store listing worksheet with deployed public URLs."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from urllib.parse import urlparse

from check_chrome_store_assets import main as check_assets


ROOT = Path(__file__).resolve().parents[2]
VERSION = json.loads((ROOT / "extension/package.json").read_text(encoding="utf-8"))["version"]
PLACEHOLDER_HOSTS = {"example.com", "example.org", "example.net", "localhost"}


def validate_public_url(value: str, label: str) -> str:
    parsed = urlparse(value.rstrip("/"))
    host = (parsed.hostname or "").lower()
    if parsed.scheme != "https" or not host:
        raise SystemExit(f"{label} must be an absolute HTTPS URL")
    if host in PLACEHOLDER_HOSTS or host.endswith(".local") or host.startswith("your-"):
        raise SystemExit(f"{label} must not use a development or placeholder host")
    if parsed.query or parsed.fragment:
        raise SystemExit(f"{label} must not contain a query or fragment")
    return value.rstrip("/")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--public-base-url", required=True)
    parser.add_argument(
        "--package-archive",
        default=f"dist/release/SuhuangScroll-Bridge-ChromeStore-v{VERSION}.zip",
        help="Archive path to record in the worksheet.",
    )
    parser.add_argument(
        "--output",
        default=f"dist/release/SuhuangScroll-ChromeStore-listing-v{VERSION}.json",
    )
    args = parser.parse_args()

    base = validate_public_url(args.public_base_url, "--public-base-url")
    if check_assets() != 0:
        raise SystemExit("Chrome Web Store asset check failed")

    manifest = json.loads((ROOT / "extension/manifest.json").read_text(encoding="utf-8"))
    permissions = manifest.get("permissions", [])
    host_permissions = manifest.get("host_permissions", [])
    permission_justifications = {
        "sidePanel": "Display local Runtime readiness and operator controls.",
        "storage": "Persist local panel preferences in Chrome storage.",
        "activeTab": "Act on the selected grading tab after an operator action.",
        "tabs": "Read the active supported grading tab for adapter context.",
        "scripting": "Run the registered site adapter on the selected grading tab.",
    }
    listing = {
        "version": VERSION,
        "name": manifest["name"],
        "shortDescription": "Connect supported grading websites to the local Suhuang Scroll Runtime.",
        "detailedDescription": (
            "Suhuang Scroll Bridge is the browser-side execution layer for the "
            "operator-controlled Suhuang Scroll AI-assisted grading Runtime. "
            "Before reading grading-page data, it shows a data notice and requires "
            "affirmative operator consent. It then reads supported grading-page "
            "context and answer images only when the operator invokes a workflow, "
            "while grading specs, model calls, run state, and review policy remain "
            "in the local Runtime. Score writeback and submission require explicit "
            "operator action."
        ),
        "category": "Productivity",
        "language": "zh_CN",
        "websiteUrl": f"{base}/",
        "privacyPolicyUrl": f"{base}/privacy/",
        "termsOfServiceUrl": f"{base}/terms/",
        "supportUrl": f"{base}/support/",
        "package": {
            "archive": args.package_archive,
            "manifestVersion": 3,
            "version": VERSION,
        },
        "graphicAssets": {
            "icon": "extension/public/icons/icon128.png",
            "screenshot": "extension/store/assets/screenshot-runtime-bridge.png",
            "smallPromoTile": "extension/store/assets/promo-small.png",
        },
        "permissions": [
            {
                "name": permission,
                "justification": permission_justifications.get(
                    permission, "Required by the registered grading-site adapter workflow."
                ),
            }
            for permission in permissions
        ],
        "hostPermissions": [
            {
                "pattern": pattern,
                "justification": (
                    "Connect to the operator's local API."
                    if "localhost" in pattern or "127.0.0.1" in pattern
                    else "Run the registered site adapter on a supported grading website."
                ),
            }
            for pattern in host_permissions
        ],
        "privacyPractices": {
            "singlePurpose": "Connect supported grading pages to a local operator-controlled grading Runtime.",
            "dataHandled": [
                "Website content and resources (page context and answer images)",
                "User-provided content (operator-selected grading inputs)",
                "Web browsing activity limited to supported grading pages",
            ],
            "use": "Provide the extension's local grading bridge and adapter features.",
            "sharing": "The extension does not send data to Suhuang servers by default; after affirmative consent, the local Runtime may send selected inputs to the provider configured by the operator.",
            "retention": "Local Runtime configuration controls run-record and provider retention.",
            "manualDashboardCertificationRequired": True,
        },
        "submissionNotes": [
            "Verify the deployed policy, terms, and support URLs from a clean browser session.",
            "Upload the checked-in screenshot and small promotional tile in the Store Listing tab.",
            "Complete Chrome's Privacy practices and Limited Use declarations in the dashboard.",
            "Run a clean-install dry run with synthetic data before submitting for review; serve extension/public and open /fixture/synthetic-grading.html.",
        ],
    }
    output = ROOT / args.output
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(listing, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(output)


if __name__ == "__main__":
    main()
