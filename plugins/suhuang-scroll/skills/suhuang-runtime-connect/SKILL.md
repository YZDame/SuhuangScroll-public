---
name: suhuang-runtime-connect
description: "Use when installing or connecting the local Suhuang Runtime Agent to a hosted Suhuang MCP control plane. Keep installation, token handling, and live grading behind explicit operator confirmation."
---

# Connect the local Runtime

This Skill describes setup; it does not silently install software or start a
long-running process. Ask the operator to confirm before running an installer,
creating a background service, or connecting a local Runtime to a hosted
control plane.

## Local Runtime

Prefer the versioned release installer and verify its checksum. For a source
checkout, use the repository's existing install path:

```bash
curl -fsSL https://raw.githubusercontent.com/YZDame/SuhuangScroll-public/main/scripts/install/install.sh -o /tmp/suhuang-install.sh
bash /tmp/suhuang-install.sh --repo YZDame/SuhuangScroll-public --version <version>
```

Then run the read-only diagnostic:

```bash
suhuang doctor --format json
```

Do not ask the operator to paste API keys, browser cookies, or student records
into chat. Model keys remain in the local Runtime configuration.

## Hosted Runtime Agent

Call `suhuang_runtime_pair` in the hosted Plugin first. The operator should
copy the short-lived pairing code to the local terminal. Never invent a code or
place a Runtime token in a Skill, source file, Plugin archive, or shell history
shown in a report.

```bash
SUHUANG_CONTROL_PLANE_URL=https://<your-host> \
SUHUANG_PAIRING_CODE=<one-time-code> \
SUHUANG_ROOT=<local-runtime-root> \
node <plugin-root>/mcp/agent.mjs
```

The Agent makes outbound HTTPS requests and invokes the bundled stdio bridge.
It does not expose a local HTTP listener. The hosted tool set supports
diagnostics, spec validation, adapter/provider listing, aggregate stats, dry
grading preparation, and explicitly confirmed manual-confirmation run control.
It never starts an automatic-submit run and does not return per-student/OCR
record rows. For live calls, configure `SPEC_DIR` or
`SUHUANG_WORKSPACE_DIR` if the requested spec is outside `SUHUANG_ROOT`.

## Verification order

1. Run `suhuang_runtime_status` or `suhuang doctor` locally.
2. Start the Agent only after the endpoint and token are confirmed.
3. Call `suhuang_runtime_status` through the Plugin.
4. Validate a synthetic spec before inspecting a private spec.
5. Keep live grading in the existing TUI/CLI confirmation flow.
