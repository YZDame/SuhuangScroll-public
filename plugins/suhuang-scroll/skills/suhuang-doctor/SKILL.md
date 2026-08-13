---
name: suhuang-doctor
description: "Use when diagnosing Suhuang Scroll local setup and readiness: check Python, CLI/TUI commands, providers, adapters, Chrome extension/browser action readiness, current automation status, and configuration problems without starting real grading submissions."
---

# Suhuang Doctor

Check Suhuang Scroll readiness without changing live grading state. Use read-only checks, validation commands, doctor/status commands, and adapter inspection.

## Use For

- Verifying local Python and CLI availability.
- Checking whether the TUI command is present.
- Inspecting schema, provider, adapter, and site configuration.
- Diagnosing Chrome extension or site-adapter readiness.
- Checking whether an automation run is active before suggesting a new run.

Do not perform real submissions, batch grading, score writeback, or long-running `start` commands without explicit user confirmation.

## Runtime Context

Use the current workspace or the path configured by `SUHUANG_ROOT`. An
installed Plugin must not assume the author's checkout path. Prefer the MCP
tools supplied by this Plugin, then fall back to the installed `suhuang` CLI.

Useful files:

- CLI: `core/python/cli.py`
- Browser actions: `extension/AGENT_ACTIONS.md`
- Adapter scaffolding and lifecycle skill: `skills/suhuang-adapter/SKILL.md`
- Adapter manifest: `core/python/resources/site_adapters.json`

## Fast Checks

Prefer the smallest checks that answer the user's question.

```bash
python --version
suhuang --help
suhuang schema --name question_spec
suhuang adapters list
suhuang status
```

If available in the current CLI, use:

```bash
suhuang doctor
suhuang doctor
```

For one adapter:

```bash
suhuang adapters inspect zhixue
```

Use the actual adapter named by the user. Known repo adapters may include `zhixue`, `readboy`, and `dongni`, but verify with `adapters list` because local state can drift.

## Extension And Browser Readiness

The Chrome extension is browser-side execution plumbing. Relevant action names include:

- `capture_current_answer`
- `get_page_context`
- `observe_page_change`
- `write_score`
- `submit_score`
- `submit_batch_scores`
- `healthcheck`

If the user needs live readiness, tell them to open the grading page in Chrome with the extension loaded, then use the repo's readiness or healthcheck path. Do not improvise a live submission test.

## Reporting

Report concrete commands and outcomes:

- Passed checks.
- Failed command and exact error summary.
- Missing dependency, command, provider, adapter, or browser state.
- Whether a current run is active.
- Next minimal fix.

If a run is active, do not suggest starting another run until the user understands the state.
