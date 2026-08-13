# Suhuang Scroll Codex Plugin

Suhuang Scroll is a local grading Runtime. This Plugin supplies Codex Skills,
a local stdio MCP bridge, and the Runtime Agent used by the hosted MCP relay
for safe inspection, preparation, and manually confirmed run control:

- validate Markdown question specs;
- inspect model/provider and site-adapter readiness;
- read automation status and aggregate statistics;
- prepare a grading plan before a run;
- start a manual-confirmation grading run and control its pause/resume/stop/retry state;
- confirm the current pending score only when the operator explicitly asks for submission.

The Plugin does not contain the Python Runtime, a browser profile, cookies, or
student records. Ask Codex to use `$suhuang-runtime-setup` when the Runtime is
missing. It presents the versioned installer, asks for confirmation before
downloading executable files, verifies the release checksum, and then exposes
the installed command to the bridge:

```bash
export SUHUANG_CLI=/absolute/path/to/suhuang
# or
export SUHUANG_ROOT=/absolute/path/to/agentic-grading
```

Plugin installation itself does not silently run `curl`, `npm`, or a lifecycle
download. This keeps the public package reviewable and leaves the operator in
control of executable-file installation. The setup Skill is the explicit
one-command path after installation.

For a hosted Plugin deployment, the public MCP endpoint is supplied by
`services/mcp-control-plane`. Call `suhuang_runtime_pair` in Codex, then start
the local Agent with the one-time code. The Agent makes an outbound connection
and invokes this same bridge on the user's machine:

```bash
SUHUANG_CONTROL_PLANE_URL=https://mcp.example.com \
SUHUANG_PAIRING_CODE=<one-time-code> \
SUHUANG_ROOT=/absolute/path/to/agentic-grading \
node mcp/agent.mjs
```

The Agent does not open an inbound port. Remote calls accept only relative
paths, block per-student/OCR records, require `confirm=true` for live actions,
and force every started run into manual-confirmation mode.

The hosted service also supports an explicitly opt-in, tenant-scoped synthetic
review fixture. It is intended for Codex Scan Tools and store review when no
private local Runtime is available; it returns only the public synthetic Spec,
empty statistics, and dry-run safety fields. It is disabled by default and is
not a substitute for pairing a real Runtime in production.

The Chrome Extension is distributed separately through the Chrome Web Store.
The public GitHub repository is the primary Plugin marketplace; Hosted MCP is
an optional advanced connection rather than a prerequisite for local use.
After installing both components, the local Runtime/API remains the boundary
between Codex, the vision provider, and browser adapters.

## Safety boundary

The local and hosted MCP surfaces expose diagnostics, spec preparation, and two
explicit live controls: `suhuang_start_grading` and
`suhuang_control_grading`. Both require `confirm=true`; starts always use
manual-confirmation mode, and `submit` only confirms the pending decision that
the Chrome adapter is already waiting to execute. Automatic submission is not
available through the Plugin.

## Install from the public GitHub marketplace

Add the public repository as a Git-backed marketplace and install the Plugin
from the Codex/ChatGPT desktop Plugins Directory:

```bash
codex plugin marketplace add YZDame/SuhuangScroll-public --ref main
codex plugin marketplace list
codex plugin list --available --marketplace suhuang-scroll
```

Select the `Suhuang Scroll` marketplace in Plugins Directory and install the
Plugin. A scripted install can use:

```bash
codex plugin add suhuang-scroll@suhuang-scroll
```

Refresh the marketplace for a new release:

```bash
codex plugin marketplace upgrade suhuang-scroll
codex plugin add suhuang-scroll@suhuang-scroll
```

## Local development

A source checkout may include `.agents/plugins/marketplace.json`. When that
checkout is available to the target Codex user, add it as a local marketplace
for development and review:

```bash
codex plugin marketplace add /path/to/SuhuangScroll
codex plugin list
codex plugin add suhuang-scroll@suhuang-scroll
```

Replace `/path/to/SuhuangScroll` with the local checkout or the publisher's
configured marketplace path. The public Plugin is installed from the
GitHub-backed marketplace above. The separate Plugin archive in GitHub
Releases is a reviewable artifact and a fallback for environments that do not
use a marketplace.

The exact marketplace name can be checked with `codex plugin marketplace list`.
The local marketplace path is useful for contributors and for testing changes
before they are synced to the public repository. The current public release
does not depend on the OpenAI universal Plugin Directory.

Run the plugin validator and the MCP smoke test from the repository root:

```bash
python3 ~/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py plugins/suhuang-scroll
node plugins/suhuang-scroll/mcp/server.mjs
```

For source Runtime development:

```bash
cd core/python
python -m pip install -e .
```

## Distribution status

The checked-in package is ready for the GitHub-backed marketplace and the
versioned GitHub Release workflow. The Chrome Web Store listing is a separate
browser install. Hosted MCP is retained as an optional OAuth connection; the
local `.mcp.json` remains the desktop bridge and is not the hosted public
service.
