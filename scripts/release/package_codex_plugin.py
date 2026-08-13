#!/usr/bin/env python3
"""Create a clean Codex Plugin source archive for review or local marketplace use."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import zipfile
from pathlib import Path
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parents[2]
PLUGIN_ROOT = ROOT / "plugins" / "suhuang-scroll"
APP_KEY_PATTERN = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
APP_ID_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{5,}$")
REPOSITORY_PATTERN = re.compile(r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$")
PLACEHOLDER_APP_ID_WORDS = ("todo", "placeholder", "example", "your-app", "replace")
SOURCE_REPOSITORY = "YZDame/" + "SuhuangScroll"


def checksum(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def validate_app_reference(app_id: str, app_key: str) -> None:
    if not APP_ID_PATTERN.fullmatch(app_id):
        raise SystemExit(
            "--app-id must be a real registered app identifier, not a URL or placeholder"
        )
    lowered = app_id.lower()
    if any(word in lowered for word in PLACEHOLDER_APP_ID_WORDS):
        raise SystemExit("--app-id contains a placeholder word; use the ID from the developer portal")
    if not APP_KEY_PATTERN.fullmatch(app_key):
        raise SystemExit("--app-key must use lowercase kebab-case")


def validate_public_base_url(base_url: str) -> str:
    parsed = urlparse(base_url)
    if parsed.scheme != "https" or not parsed.netloc or parsed.query or parsed.fragment:
        raise SystemExit("--public-base-url must be an HTTPS origin/path without query or fragment")
    hostname = (parsed.hostname or "").lower()
    if hostname in {"localhost", "127.0.0.1", "::1"} or hostname.endswith(".local"):
        raise SystemExit("--public-base-url cannot point to localhost or a .local development host")
    if hostname in {"example.com", "example.org", "example.net"} or hostname.startswith("your-"):
        raise SystemExit("--public-base-url must be a real public domain, not an example host")
    return base_url.rstrip("/")


def validate_release_repo(value: str) -> str:
    if not REPOSITORY_PATTERN.fullmatch(value):
        raise SystemExit("--release-repo must use YZDame/SuhuangScroll-public form")
    if value == SOURCE_REPOSITORY:
        raise SystemExit("--release-repo must be a separate public Runtime repository")
    return value


def rewrite_release_repo(payload: bytes, release_repo: str) -> bytes:
    """Point public Plugin installer instructions at the public Runtime repo."""
    try:
        text = payload.decode("utf-8")
    except UnicodeDecodeError:
        return payload
    text = text.replace(
        f"raw.githubusercontent.com/{SOURCE_REPOSITORY}",
        f"raw.githubusercontent.com/{release_repo}",
    )
    text = text.replace("--repo YZDame/SuhuangScroll-public", f"--repo {release_repo}")
    text = text.replace("-Repository YZDame/SuhuangScroll-public", f"-Repository {release_repo}")
    return text.encode("utf-8")


def public_manifest(
    manifest: dict,
    app_id: str | None,
    app_key: str,
    public_base_url: str | None,
    repository_url: str | None,
) -> tuple[dict, dict | None]:
    if not app_id and not public_base_url and not repository_url:
        return manifest, None

    manifest = dict(manifest)
    if app_id:
        # `.app.json` is a compatibility wiring format for local/developer
        # mode. Public submission is completed against the hosted MCP URL in
        # the Platform portal and does not require this identifier.
        validate_app_reference(app_id, app_key)
        manifest["apps"] = "./.app.json"
    if public_base_url:
        base_url = validate_public_base_url(public_base_url)
        interface = dict(manifest.get("interface", {}))
        interface["websiteURL"] = base_url
        interface["privacyPolicyURL"] = f"{base_url}/privacy/"
        interface["termsOfServiceURL"] = f"{base_url}/terms/"
        manifest["interface"] = interface
        manifest["homepage"] = f"{base_url}/"
        if repository_url:
            manifest["repository"] = validate_public_base_url(repository_url)
        else:
            # Do not carry a private source-repository URL into a public
            # candidate when the publisher has not supplied a public mirror.
            manifest.pop("repository", None)
    app_manifest = {"apps": {app_key: {"id": app_id}}} if app_id else None
    return manifest, app_manifest


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out-dir", default="dist/release")
    parser.add_argument(
        "--output",
        help="Optional archive path for a public or developer-mode candidate.",
    )
    parser.add_argument(
        "--app-id",
        help="Registered MCP app/connection ID (for example plugin_asdk_app_...); adds .app.json to the archive.",
    )
    parser.add_argument(
        "--app-key",
        default="suhuang-scroll",
        help="Key used in .app.json's apps object (default: suhuang-scroll).",
    )
    parser.add_argument(
        "--public-base-url",
        help="Public HTTPS site base; rewrites Plugin website/privacy/terms URLs to /, /privacy, and /terms.",
    )
    parser.add_argument(
        "--repository-url",
        help="Optional public repository URL to use in archive metadata.",
    )
    parser.add_argument(
        "--channel",
        choices=("local", "public"),
        default="local",
        help="Release profile. public requires --public-base-url and --release-repo; --app-id is optional developer-mode wiring.",
    )
    parser.add_argument(
        "--release-repo",
        help="Public YZDame/SuhuangScroll-public hosting the Runtime release binaries and installer scripts.",
    )
    args = parser.parse_args()

    if args.channel == "public" and not args.public_base_url:
        raise SystemExit("--channel public requires --public-base-url")
    release_repo = validate_release_repo(args.release_repo) if args.release_repo else None
    if args.channel == "public" and not release_repo:
        raise SystemExit("--channel public requires --release-repo")

    manifest_path = PLUGIN_ROOT / ".codex-plugin" / "plugin.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    version = str(manifest["version"])
    out_dir = ROOT / args.out_dir
    out_dir.mkdir(parents=True, exist_ok=True)
    archive = (
        Path(args.output).expanduser()
        if args.output
        else out_dir / f"SuhuangScroll-CodexPlugin-v{version}.zip"
    )
    archive.parent.mkdir(parents=True, exist_ok=True)
    if archive.exists():
        archive.unlink()

    manifest, app_manifest = public_manifest(
        manifest,
        args.app_id,
        args.app_key,
        args.public_base_url,
        args.repository_url,
    )
    manifest_bytes = (json.dumps(manifest, indent=2, ensure_ascii=False) + "\n").encode("utf-8")
    app_bytes = (
        (json.dumps(app_manifest, indent=2, ensure_ascii=False) + "\n").encode("utf-8")
        if app_manifest is not None
        else None
    )

    with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED) as zip_file:
        for path in sorted(PLUGIN_ROOT.rglob("*")):
            if not path.is_file():
                continue
            relative = path.relative_to(PLUGIN_ROOT)
            if ".DS_Store" in relative.parts or "node_modules" in relative.parts:
                continue
            if relative.as_posix() == ".codex-plugin/plugin.json":
                zip_file.writestr(relative.as_posix(), manifest_bytes)
                continue
            if relative.as_posix() == ".app.json" and app_bytes is not None:
                raise SystemExit("source plugin already contains .app.json; remove it before using --app-id")
            payload = path.read_bytes()
            if release_repo:
                payload = rewrite_release_repo(payload, release_repo)
            zip_file.writestr(relative.as_posix(), payload)
        if app_bytes is not None:
            zip_file.writestr(".app.json", app_bytes)

    checksum_path = archive.with_suffix(archive.suffix + ".sha256")
    checksum_path.write_text(f"{checksum(archive)}  {archive.name}\n", encoding="utf-8")
    print(archive)
    print(checksum_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
