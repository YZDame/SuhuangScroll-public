# Suhuang Scroll Runtime

This repository is the public Runtime distribution mirror for Suhuang Scroll.
It contains release installers, native Runtime archives, public Skills, the
Chrome Extension source, public contracts, and the Hosted MCP deployment
materials. The Python and Rust implementation source remains outside this
distribution mirror; ordinary users do not need Python, Node.js, Rust, or a
source checkout.

## Install the Runtime

Set the public release repository explicitly when installing from a mirror:

```bash
curl -fsSL https://raw.githubusercontent.com/YZDame/SuhuangScroll-public/main/scripts/install/install.sh \
  -o "${TMPDIR:-/tmp}/suhuang-install.sh"
bash "${TMPDIR:-/tmp}/suhuang-install.sh" \
  --repo YZDame/SuhuangScroll-public \
  --version latest
```

Windows PowerShell:

```powershell
Invoke-WebRequest `
  https://raw.githubusercontent.com/YZDame/SuhuangScroll-public/main/scripts/install/install.ps1 `
  -OutFile "$env:TEMP\suhuang-install.ps1"
& "$env:TEMP\suhuang-install.ps1" `
  -Repository YZDame/SuhuangScroll-public `
  -Version latest
```

The installer downloads a platform-specific GitHub Release, verifies its
SHA256 file, installs under a user-local directory, and runs `suhuang doctor`.
Use a pinned version for reproducible deployments. Keep model API keys, browser
profiles, cookies, Specs, and run records in local user data; do not put them
in this repository or in a public issue.

## Chrome Extension and Codex Plugin

The Chrome Extension is uploaded separately to the Chrome Web Store. The Codex
Plugin is the Agent-facing distribution unit and contains Skills, the local
MCP bridge, and the Hosted Runtime Agent. Plugin installation does not silently
download executables; use its explicit Runtime setup Skill after installation.

The public Hosted MCP URL is submitted through the OpenAI Plugin portal. The
local `.mcp.json` bridge is for development and desktop use; it is not the
public service endpoint.

## Documentation

- [Install, upgrade, and uninstall](docs/install-upgrade-uninstall.md)
- [Plugin publication runbook](docs/publication-runbook.md)
- [Hosted MCP deployment](docs/plugin-mcp-deployment.md)
- [Chrome Web Store submission](docs/chrome-store-submission.md)
- [Public schemas](schemas/README.md)

Live grading can be started from Codex only through the explicit
`suhuang_start_grading` confirmation flow; browser execution, score writeback,
and submission remain operator-confirmed actions in the local Runtime and
Chrome Extension workflow. Automatic submission is not exposed through MCP.
