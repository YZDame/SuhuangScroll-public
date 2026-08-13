# Suhuang Scroll distribution

The current public distribution has four separate pieces. GitHub is the
source of truth for the Plugin marketplace and Runtime releases; the Chrome
extension remains a browser-store install; Hosted MCP is an optional advanced
connection and is not required for the local workflow.

| Piece | User action | What it provides |
| --- | --- | --- |
| GitHub-backed Plugin Marketplace | Add the public repository, then install from Plugins Directory | Codex Skills and the local MCP bridge |
| GitHub Releases | Run the installer or download a matching archive | Native Runtime: CLI, backend, and TUI |
| Chrome Web Store | Install the Suhuang Scroll Bridge extension | Browser-side page adapter and score-write boundary |
| Hosted MCP | Pair a local Runtime Agent with the public endpoint | Optional remote Agent-to-local-Runtime connection |

The OpenAI universal Plugin Directory is intentionally not part of the current
release gate. A future submission can reuse the same Plugin manifest and Hosted
MCP contract.

## Install the Plugin from GitHub

Use the public repository as a Git-backed marketplace source. Pinning `main`
keeps the install command explicit while still allowing the maintainer to
publish compatible updates there:

```bash
codex plugin marketplace add YZDame/SuhuangScroll-public --ref main
codex plugin marketplace list
codex plugin list --available --marketplace suhuang-scroll
```

Then open the Codex/ChatGPT desktop **Plugins Directory**, select the
`Suhuang Scroll` marketplace, and install and enable `Suhuang Scroll`.

The equivalent CLI install is useful for scripted environments:

```bash
codex plugin add suhuang-scroll@suhuang-scroll
```

The marketplace source is the public Git repository. The catalog entry points
at `./plugins/suhuang-scroll`, and the Plugin manifest is
`plugins/suhuang-scroll/.codex-plugin/plugin.json`. A fresh install does not
silently execute `curl`, `npm`, or another executable download.

## Upgrade or remove it

Refresh the Git snapshot first, then reinstall or update the Plugin from the
Plugins Directory:

```bash
codex plugin marketplace upgrade suhuang-scroll
codex plugin add suhuang-scroll@suhuang-scroll
```

To remove the local installation and its cache:

```bash
codex plugin remove suhuang-scroll@suhuang-scroll
codex plugin marketplace remove suhuang-scroll
```

Removing a marketplace changes only local Codex configuration and cache; it
does not remove the GitHub repository or any Runtime user data.

## Install and diagnose the Runtime

The Plugin supplies Skills and the bridge, while the Runtime is a separate
versioned release. On macOS or Linux, download the installer before executing
it so the command remains inspectable:

```bash
curl -fsSL https://raw.githubusercontent.com/YZDame/SuhuangScroll-public/main/scripts/install/install.sh \
  -o "${TMPDIR:-/tmp}/suhuang-install.sh"
bash "${TMPDIR:-/tmp}/suhuang-install.sh" \
  --repo YZDame/SuhuangScroll-public \
  --version latest
suhuang doctor
```

For a reproducible deployment, replace `latest` with a release such as
`v0.6.4`. The installer verifies the downloaded SHA256 file and keeps Specs,
configuration, and run records in the user data directory. Windows users
should follow the PowerShell instructions in
[Install, upgrade, and uninstall](install-upgrade-uninstall.md).

Run the doctor before asking Codex to prepare a grading run:

```bash
suhuang doctor --format json
```

It checks the Runtime executable, provider configuration, backend/TUI
readiness, adapter registry, and Chrome Bridge connectivity. It does not start
grading or write a score.

## Install the Chrome Bridge

The Chrome Bridge is a separate install because it is the browser execution
boundary. The public release page is the fallback download and the source of
the version-matched Chrome Store candidate:

- [Suhuang Scroll releases](https://github.com/YZDame/SuhuangScroll-public/releases/latest)
- [Chrome Web Store search for Suhuang Scroll Bridge](https://chromewebstore.google.com/search/Suhuang%20Scroll%20Bridge)

When the Store listing is live, prefer its `Add to Chrome` page. Until then,
use the release archive only for development or controlled review:

1. Download `SuhuangScroll-Bridge-ChromeStore-v<version>.zip` from the release.
2. For a local unpacked test, extract it and load the directory from
   `chrome://extensions/` with Developer mode enabled.
3. Confirm the Runtime and extension versions match.
4. Grant the extension's data notice only on an intended grading page.

The extension requests only the permissions required for its side panel,
local Runtime connection, selected-tab adapter actions, and registered grading
sites. It does not read page data before affirmative consent and does not send
cookies or browser credentials to Suhuang servers.

## MCP and permission boundaries

The default marketplace installation uses the local stdio bridge declared in
`.mcp.json`. It discovers the installed Runtime through `SUHUANG_CLI`,
`SUHUANG_ROOT`, or the versioned user install path. The bridge exposes
diagnostics, Spec validation, preparation, statistics, and explicitly
confirmed manual run controls; it does not enable automatic submission.

Hosted MCP is optional. It uses OAuth and a paired local Runtime Agent, so a
user does not put a bearer token, browser cookie, model key, or student data in
the marketplace command or Plugin manifest. Use the [Hosted MCP deployment
guide](plugin-mcp-deployment.md) only when a remote Agent-to-local-Runtime
connection is needed.

## Common faults

| Symptom | Check | Fix |
| --- | --- | --- |
| `marketplace add` cannot resolve the source | `codex plugin marketplace list` | Check the public repository name, network access, and `--ref main`; do not use the private development repository. |
| Plugin is not shown in Plugins Directory | `codex plugin list --available --marketplace suhuang-scroll` | Restart the desktop app, run `codex plugin marketplace upgrade suhuang-scroll`, and verify that `.agents/plugins/marketplace.json` exists in the repository. |
| Plugin tools report Runtime missing | `suhuang doctor` | Run `suhuang-runtime-setup` or the versioned GitHub installer, then run the doctor again. |
| Extension is installed but the bridge is unavailable | `suhuang doctor --format json` and the extension side panel | Install the matching Chrome Bridge version, allow the local Runtime process, and keep the extension's data notice granted for the intended page. |
| Hosted MCP returns 401 | OAuth/resource metadata and pairing state | Re-authenticate the connection and pair the local Runtime Agent; never paste a token into a public issue or commit it. |
| Runtime and extension versions differ | Release asset names and `suhuang --version` | Upgrade both from the same GitHub Release before running a site adapter. |

For a reproducible report, include the Plugin, Runtime, and extension versions,
OS/browser versions, and redacted `suhuang doctor --format json` output. Do not
include cookies, student answers, credentials, model keys, or private run
records.
