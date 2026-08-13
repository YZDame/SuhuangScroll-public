#!/usr/bin/env python3
"""Validate the repository's Codex Plugin package without Codex runtime state."""

from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
PLUGIN_ROOT = ROOT / "plugins" / "suhuang-scroll"
SEMVER = re.compile(r"^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$")


def load_json(path: Path, errors: list[str]):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        errors.append(f"missing JSON file: {path.relative_to(ROOT)}")
    except json.JSONDecodeError as error:
        errors.append(f"invalid JSON in {path.relative_to(ROOT)}: {error}")
    return None


def main() -> int:
    errors: list[str] = []
    manifest_path = PLUGIN_ROOT / ".codex-plugin" / "plugin.json"
    manifest = load_json(manifest_path, errors) or {}
    if manifest.get("name") != PLUGIN_ROOT.name:
        errors.append("manifest name must match plugins/suhuang-scroll")
    if not SEMVER.match(str(manifest.get("version", ""))):
        errors.append("plugin version must be semver")
    if not manifest.get("description"):
        errors.append("plugin description is required")
    interface = manifest.get("interface") if isinstance(manifest.get("interface"), dict) else {}
    for field in ("websiteURL", "privacyPolicyURL", "termsOfServiceURL"):
        value = interface.get(field)
        if not isinstance(value, str) or not value.startswith("https://"):
            errors.append(f"interface.{field} must be an HTTPS URL")
    for field in ("logo", "composerIcon"):
        value = interface.get(field)
        if value is not None:
            if not isinstance(value, str) or not value.startswith("./"):
                errors.append(f"interface.{field} must be a relative ./ path")
            elif not (PLUGIN_ROOT / value[2:]).is_file():
                errors.append(f"interface.{field} asset is missing: {value}")

    skills_value = manifest.get("skills")
    skills_root = PLUGIN_ROOT / "skills"
    if not isinstance(skills_value, str) or not skills_value.startswith("./"):
        errors.append("manifest skills must be a relative ./ path")
    if not skills_root.is_dir():
        errors.append("plugin skills directory is missing")
    else:
        for skill_dir in sorted(path for path in skills_root.iterdir() if path.is_dir()):
            if not (skill_dir / "SKILL.md").exists():
                errors.append(f"skill missing SKILL.md: {skill_dir.relative_to(ROOT)}")

    mcp_value = manifest.get("mcpServers")
    if mcp_value != "./.mcp.json":
        errors.append("manifest mcpServers must point to ./.mcp.json")
    mcp = load_json(PLUGIN_ROOT / ".mcp.json", errors) or {}
    servers = mcp.get("mcpServers") if isinstance(mcp, dict) else None
    if not isinstance(servers, dict) or not servers:
        errors.append(".mcp.json must define at least one server")
    else:
        for server_name, config in servers.items():
            if not isinstance(config, dict) or not isinstance(config.get("command"), str):
                errors.append(f"MCP server {server_name} must define a command")
            if config.get("cwd") not in (None, "."):
                errors.append(f"MCP server {server_name} must use plugin-relative cwd")

    # The public MCP scanner expects each tool to expose a human-readable
    # title. Validate the bundled bridge metadata without starting it.
    bridge_text = (PLUGIN_ROOT / "mcp" / "server.mjs").read_text(encoding="utf-8")
    required_titles = (
        'title: "Check Runtime status"',
        'title: "Diagnose Runtime"',
        'title: "List grading Specs"',
        'title: "Validate a grading Spec"',
        'title: "List site adapters"',
        'title: "List vision providers"',
        'title: "Read grading status"',
        'title: "Read grading statistics"',
        'title: "Prepare a grading plan"',
        'title: "Start manual-confirmation grading"',
        'title: "Control manual grading"',
    )
    for title in required_titles:
        if title not in bridge_text:
            errors.append(f"local MCP bridge is missing tool metadata: {title}")

    # Generic commands such as ``workspace/runs`` and ``.env`` are documented
    # concepts, not machine-specific paths. Only reject absolute author-machine
    # paths here; private data is separately excluded by repository boundaries.
    forbidden_fragments = ("/Users/", "/private/", "/var/folders/")
    for path in PLUGIN_ROOT.rglob("*"):
        if not path.is_file() or ".DS_Store" in path.name:
            if path.is_file() and ".DS_Store" in path.name:
                errors.append(f"macOS metadata in plugin: {path.relative_to(ROOT)}")
            continue
        if path.suffix not in {".md", ".json", ".mjs", ".js"}:
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        for fragment in forbidden_fragments:
            if fragment in text:
                errors.append(f"machine/private path {fragment!r} in {path.relative_to(ROOT)}")

    try:
        subprocess.run(["node", "--check", str(PLUGIN_ROOT / "mcp" / "server.mjs")], check=True, cwd=ROOT)
        subprocess.run(["node", "--check", str(PLUGIN_ROOT / "mcp" / "agent.mjs")], check=True, cwd=ROOT)
    except (OSError, subprocess.CalledProcessError) as error:
        errors.append(f"MCP server syntax check failed: {error}")

    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 1
    print("Codex Plugin package: OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
