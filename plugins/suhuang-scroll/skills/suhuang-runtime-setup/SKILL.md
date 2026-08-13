---
name: suhuang-runtime-setup
description: "Use when the Suhuang Scroll Runtime is missing or needs a first-time install, upgrade, doctor check, or uninstall. Present the versioned installer, ask for confirmation before downloading or changing local files, verify the installed CLI, and connect it to the Plugin without exposing secrets."
---

# Suhuang Runtime Setup

Use this Skill when the operator asks to install, upgrade, repair, or remove the
local Suhuang Scroll Runtime. The Plugin package contains the Codex workflows;
the Runtime release contains the native TUI, CLI, and frozen Python backend.

## Installation boundary

Installing a Runtime downloads and writes executable files. Explain the exact
target directory and release before running it, then ask for explicit operator
confirmation. Do not hide `curl`, `irm`, package-manager commands, or a
background-service setup inside a Plugin install or a normal status check.

Do not request or print model API keys, browser cookies, student answer images,
or run records. Model-provider credentials stay in the local Runtime config.

## macOS and Linux

Prefer a pinned release. Download the installer to a temporary file, inspect the
requested version, and then run it after confirmation:

```bash
curl -fsSL https://raw.githubusercontent.com/YZDame/SuhuangScroll-public/main/scripts/install/install.sh \
  -o "${TMPDIR:-/tmp}/suhuang-install.sh"
bash "${TMPDIR:-/tmp}/suhuang-install.sh" --repo YZDame/SuhuangScroll-public --version <version>
```

For the latest release, use `--version latest` only after the operator accepts
that the release may change. The installer verifies the GitHub Release archive
against its `.sha256` file and installs under `~/.local/suhuang-scroll` by
default, with the command shim at `~/.local/bin/suhuang`.

## Windows

Download the PowerShell installer to a file, review the version and target
directory, and run it only after confirmation:

```powershell
Invoke-WebRequest `
  https://raw.githubusercontent.com/YZDame/SuhuangScroll-public/main/scripts/install/install.ps1 `
  -OutFile "$env:TEMP\suhuang-install.ps1"
& "$env:TEMP\suhuang-install.ps1" -Repository YZDame/SuhuangScroll-public -Version <version>
```

The default program directory is `%LOCALAPPDATA%\Suhuang Scroll` and the
command shim is `%LOCALAPPDATA%\Suhuang\bin\suhuang.cmd`.

## Verify and connect

After installation, run only the read-only diagnostic first:

```bash
suhuang doctor --format json
suhuang status --format json
```

The local MCP bridge discovers the command from `SUHUANG_CLI`,
`SUHUANG_ROOT`, or `PATH`. Prefer the installed command on `PATH`; when it is
not on `PATH`, set an explicit path for the Codex MCP process:

```bash
export SUHUANG_CLI="$HOME/.local/bin/suhuang"
```

Do not invent a checkout path. If the diagnostic fails, report the exact
missing dependency and use `suhuang_runtime_status` or `suhuang_doctor` to
continue diagnosis.

## Upgrade and uninstall

Use the same pinned installer for an upgrade and confirm the target version.
Program files are replaced after checksum verification; user configuration,
Specs, and run records remain in their separate data directories. Uninstall
only the program directory and command shim after the operator confirms the
exact paths. Do not remove Runtime data by default.

## Hosted Runtime Agent

When the public Plugin uses the hosted MCP relay, install and verify the local
Runtime before pairing. The operator must explicitly start the outbound Agent:

```bash
SUHUANG_CONTROL_PLANE_URL=https://<your-host> \
SUHUANG_PAIRING_CODE=<one-time-code> \
SUHUANG_CLI="$HOME/.local/bin/suhuang" \
node <plugin-root>/mcp/agent.mjs
```

Pairing codes and Agent tokens are short-lived credentials. Never write them to
the Plugin package, a Skill, a public issue, or a generated release artifact.

## Live grading boundary

Runtime setup does not authorize a live grading run. After setup, the Plugin may
start a `manual_confirm` run only after a separate explicit confirmation. Model
calls, browser automation, score writeback, and website submission remain
behind that confirmation; automatic submission is not available through the
Plugin.
