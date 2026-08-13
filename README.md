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

## Install the Codex Plugin from GitHub

The public repository is a Git-backed Codex Plugin marketplace. Add it once,
then install `Suhuang Scroll` from the Plugins Directory:

```bash
codex plugin marketplace add YZDame/SuhuangScroll-public --ref main
codex plugin marketplace list
codex plugin list --available --marketplace suhuang-scroll
```

Open the Codex/ChatGPT desktop **Plugins Directory**, select the `Suhuang
Scroll` marketplace, and install the Plugin. For scripted environments, the
equivalent command is:

```bash
codex plugin add suhuang-scroll@suhuang-scroll
```

Refresh a Git-backed marketplace and reinstall the current Plugin with:

```bash
codex plugin marketplace upgrade suhuang-scroll
codex plugin add suhuang-scroll@suhuang-scroll
```

The Plugin package contains Skills and a local stdio MCP bridge. It does not
silently download executables. Use the explicit Runtime setup Skill or the
versioned installer documented in [Plugin distribution](docs/plugin-distribution.md).

## Chrome Extension and Hosted MCP

The Chrome Extension is a separate browser execution boundary. Install it from
the Chrome Web Store when the listing is live, or use the matching candidate
archive from the [GitHub Releases page](https://github.com/YZDame/SuhuangScroll-public/releases/latest)
for controlled local review. The extension requires affirmative data consent
before reading a supported grading page.

Hosted MCP is an optional advanced connection. It pairs a user-owned local
Runtime Agent with the public HTTPS control plane using OAuth; it is not needed
for the local marketplace workflow and does not receive browser cookies,
student records, or model keys by default.

The OpenAI universal Plugin Directory is deferred for the current release
cycle. The same manifest, Skills, and Hosted MCP contract remain compatible with
a future submission.

## Documentation

- [Plugin distribution and troubleshooting](docs/plugin-distribution.md)
- [Install, upgrade, and uninstall](docs/install-upgrade-uninstall.md)
- [Plugin publication runbook](docs/publication-runbook.md)
- [Hosted MCP deployment](docs/plugin-mcp-deployment.md)
- [Chrome Web Store submission](docs/chrome-store-submission.md)
- [Public schemas](schemas/README.md)

Live grading can be started from Codex only through the explicit
`suhuang_start_grading` confirmation flow; browser execution, score writeback,
and submission remain operator-confirmed actions in the local Runtime and
Chrome Extension workflow. Automatic submission is not exposed through MCP.
