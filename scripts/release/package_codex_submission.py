#!/usr/bin/env python3
"""Create a machine-readable Codex Plugin submission worksheet."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parents[2]
PLUGIN_ROOT = ROOT / "plugins" / "suhuang-scroll"
APP_ID_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{5,}$")
REPOSITORY_PATTERN = re.compile(r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$")
PLACEHOLDER_WORDS = ("todo", "placeholder", "example", "your-app", "replace")


def public_url(value: str, label: str, *, path: str | None = None) -> str:
    parsed = urlparse(value.rstrip("/"))
    host = (parsed.hostname or "").lower()
    if parsed.scheme != "https" or not parsed.netloc or parsed.query or parsed.fragment:
        raise SystemExit(f"{label} must be an HTTPS URL without query or fragment")
    if host in {"localhost", "127.0.0.1", "::1", "example.com", "example.org", "example.net"}:
        raise SystemExit(f"{label} must use a real public host")
    if host.endswith(".local") or host.startswith("your-"):
        raise SystemExit(f"{label} must not use a development or placeholder host")
    normalized = value.rstrip("/")
    if path is not None and parsed.path.rstrip("/") != path.rstrip("/"):
        raise SystemExit(f"{label} path must be {path}")
    return normalized


def app_id(value: str) -> str:
    if not APP_ID_PATTERN.fullmatch(value) or any(word in value.lower() for word in PLACEHOLDER_WORDS):
        raise SystemExit("--app-id must be the real registered MCP connection ID")
    return value


def release_repo(value: str) -> str:
    if not REPOSITORY_PATTERN.fullmatch(value):
        raise SystemExit("--release-repo must use YZDame/SuhuangScroll-public form")
    if value == "YZDame/" + "SuhuangScroll":
        raise SystemExit("--release-repo must be a separate public Runtime repository")
    return value


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def test_cases() -> dict[str, list[dict[str, str]]]:
    return {
        "positive": [
            {
                "id": "runtime-status",
                "prompt": "Check whether my Suhuang Runtime is ready.",
                "expected": "Calls suhuang_runtime_status and reports the discovered CLI without starting grading.",
                "expectedResultShape": "Structured object with runtime discovery status and no grading side effects.",
                "fixture": "A local Runtime installation; no account or student data.",
            },
            {
                "id": "start-manual-confirmation",
                "prompt": "Start grading for workspace/specs/minimal-fill-blank-spec.md after I confirm.",
                "expected": "Calls suhuang_start_grading with confirm=true and starts only a manual-confirmation run; it never enables automatic submission.",
                "expectedResultShape": "Run state with operatorConfirmed=true, autoSubmit=false, and scoreSubmitted=false.",
                "fixture": "The isolated synthetic review tenant; it must report gradingStarted=false without starting a Runtime process.",
            },
            {
                "id": "control-manual-confirmation",
                "prompt": "After I review the pending decision, submit this one score.",
                "expected": "Calls suhuang_control_grading with action=submit and confirm=true; it forwards only the current pending decision and never accepts an arbitrary score payload.",
                "expectedResultShape": "Run state with operatorConfirmed=true, scoreSubmissionRequested=true, and no automatic-submit mode.",
                "fixture": "The paired Runtime with a synthetic pending decision; the browser adapter remains the only score-write boundary.",
            },
            {
                "id": "validate-spec",
                "prompt": "Validate workspace/specs/minimal-fill-blank-spec.md.",
                "expected": "Calls suhuang_validate_spec and returns the parsed contract or a clear validation error.",
                "expectedResultShape": "Structured validation result with contract fields or an actionable error.",
                "fixture": "workspace/specs/minimal-fill-blank-spec.md from the public synthetic fixture set.",
            },
            {
                "id": "prepare-grading",
                "prompt": "Prepare a grading plan for workspace/specs/minimal-fill-blank-spec.md.",
                "expected": "Calls suhuang_prepare_grading and reports gradingStarted=false, scoreWritten=false, and scoreSubmitted=false.",
                "expectedResultShape": "Dry plan with gradingStarted=false, scoreWritten=false, and scoreSubmitted=false.",
                "fixture": "The synthetic minimal-fill-blank spec and a non-live adapter/provider selection.",
            },
        ],
        "negative": [
            {
                "id": "missing-spec",
                "prompt": "Validate workspace/specs/does-not-exist.md.",
                "expected": "Returns a tool error and does not create a file or start grading.",
                "expectedResultShape": "Tool error identifying the missing path; no file or run is created.",
                "fixture": "A deliberately absent relative path under the synthetic workspace.",
                "whyNotComplete": "The requested spec does not exist, so continuing would invent input or mutate the workspace.",
            },
            {
                "id": "unsafe-path",
                "prompt": "Validate /Users/someone/private/spec.md.",
                "expected": "Rejects the absolute path before queueing a hosted Runtime command.",
                "expectedResultShape": "Validation error before enqueue; no Runtime command is created.",
                "fixture": "No local data; use the deliberately unsafe absolute path shown in the prompt.",
                "whyNotComplete": "The path escapes the paired Runtime root and must be rejected before queueing.",
            },
            {
                "id": "unauthenticated",
                "prompt": "Call the Hosted MCP server without linking an account.",
                "expected": "Returns HTTP 401 with an OAuth resource-metadata challenge and performs no Runtime operation.",
                "expectedResultShape": "HTTP 401 with WWW-Authenticate resource_metadata challenge.",
                "fixture": "Public Hosted MCP endpoint with no bearer token; no credentials are supplied.",
                "whyNotComplete": "The caller has not authenticated a tenant, so the server must not access or queue Runtime work.",
            },
        ],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--public-base-url", required=True, help="Public site origin serving policy/support pages.")
    parser.add_argument("--mcp-url", required=True, help="Public Hosted MCP endpoint, normally ending in /mcp.")
    parser.add_argument(
        "--app-id",
        help="Optional developer-mode MCP connection ID used only for local compatibility wiring.",
    )
    parser.add_argument("--repository-url", help="Public repository URL shown in the listing.")
    parser.add_argument(
        "--release-repo",
        required=True,
        help="Public YZDame/SuhuangScroll-public hosting Runtime release binaries and installer scripts.",
    )
    parser.add_argument(
        "--countries",
        required=True,
        help="Comma-separated country/region codes to request in the submission form.",
    )
    parser.add_argument("--release-notes", default="Initial public release of the Suhuang Scroll Plugin.")
    parser.add_argument("--package-archive", help="Optional public Plugin archive to include with SHA256.")
    parser.add_argument("--output", default="dist/release/SuhuangScroll-CodexPlugin-submission.json")
    args = parser.parse_args()

    base = public_url(args.public_base_url, "--public-base-url")
    mcp = public_url(args.mcp_url, "--mcp-url", path="/mcp")
    connection_id = app_id(args.app_id) if args.app_id else None
    repository = public_url(args.repository_url, "--repository-url") if args.repository_url else None
    runtime_release_repo = release_repo(args.release_repo)
    countries = [item.strip() for item in args.countries.split(",") if item.strip()]
    if not countries:
        raise SystemExit("--countries must contain at least one country or region code")

    manifest = json.loads((PLUGIN_ROOT / ".codex-plugin/plugin.json").read_text(encoding="utf-8"))
    interface = manifest.get("interface") or {}
    archive = Path(args.package_archive).expanduser() if args.package_archive else None
    package = None
    if archive:
        if not archive.is_file():
            raise SystemExit(f"Plugin archive not found: {archive}")
        package = {"archive": str(archive), "sha256": sha256(archive)}

    submission = {
        "schemaVersion": "suhuang.codex-plugin-submission.v2",
        "listing": {
            "name": interface.get("displayName", manifest["name"]),
            "shortDescription": interface.get("shortDescription", manifest["description"]),
            "longDescription": interface.get("longDescription", manifest["description"]),
            "developerName": interface.get("developerName", manifest.get("author", {}).get("name")),
            "category": interface.get("category", "Productivity"),
            "websiteURL": f"{base}/",
            "supportURL": f"{base}/support/",
            "privacyPolicyURL": f"{base}/privacy/",
            "termsOfServiceURL": f"{base}/terms/",
            "logo": "assets/logo.png",
            "composerIcon": "assets/composer-icon.png",
        },
        "mcp": {
            "connectionType": "Universal",
            "serverURL": mcp,
            "resource": mcp.rsplit("/mcp", 1)[0],
            "authentication": "OAuth 2.1 with PKCE (S256)",
            "scopes": ["suhuang:runtime"],
            "domainChallengeURL": f"{mcp.rsplit('/mcp', 1)[0]}/.well-known/openai-apps-challenge",
        },
        "skills": [
            {"name": path.name, "path": f"skills/{path.name}/SKILL.md"}
            for path in sorted((PLUGIN_ROOT / "skills").iterdir())
            if path.is_dir() and (path / "SKILL.md").is_file()
        ],
        "starterPrompts": interface.get("defaultPrompt", []),
        "testCases": test_cases(),
        "availability": {"countriesOrRegions": countries},
        "runtimeReleaseRepository": runtime_release_repo,
        "releaseNotes": args.release_notes,
        "repositoryURL": repository,
        "package": package,
        "manualReviewNotes": [
            "Submit the public Hosted MCP URL directly in the Platform Plugin portal and select Scan Tools; the local .app.json connection ID is optional developer-mode compatibility wiring.",
            "Scan the deployed MCP server and confirm tool annotations and OAuth security schemes.",
            "The hosted relay advertises readOnlyHint=false because every authenticated call enqueues a short-lived Runtime command; live grading tools additionally advertise destructiveHint=true and require confirm=true. Automatic submission is disabled.",
            "For reviewer automation without a private local Runtime, use a separate short-lived static review tenant with SUHUANG_MCP_REVIEW_MODE=fixture; never add real user tenants or student data to that allowlist.",
            "Verify the public policy, support, and terms pages from a clean browser session.",
            "Do not expose local paths, student records, cookies, model keys, or pairing tokens in reviewer data.",
            "Verify that start and control calls require explicit confirmation, always use manual-confirmation mode, and do not accept arbitrary score payloads.",
        ],
    }
    if connection_id:
        submission["mcp"]["developerModeConnectionId"] = connection_id

    output = ROOT / args.output
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(submission, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
