---
name: suhuang-runtime
description: "Use when connecting Codex to the local Suhuang Scroll Runtime: discover the installed CLI, inspect readiness, list specs/providers/adapters, prepare a dry grading plan, start manual-confirmation grading, and control a confirmed run."
---

# Suhuang Runtime

Use the local Suhuang Scroll Runtime as the source of grading behavior. The
Codex Plugin contributes orchestration and the MCP transport; it does not copy
the Python grading pipeline or site selectors into Skills.

## Installation boundary

The Plugin package does not silently download Python, model packages, browser
profiles, cookies, or student data. The operator installs the Runtime separately
and exposes it to the MCP bridge with one of:

```bash
export SUHUANG_CLI=/absolute/path/to/suhuang
# or
export SUHUANG_ROOT=/absolute/path/to/agentic-grading
```

For a source checkout, the developer install is:

```bash
cd core/python
python -m pip install -e .
```

If `suhuang_runtime_status` reports that no CLI is available, stop and report
the missing installation path. Do not invent a path or run a remote installer.

## Tool-first workflow

Prefer the MCP tools when they are available:

1. `suhuang_runtime_status`
2. `suhuang_doctor`
3. `suhuang_list_specs` and `suhuang_validate_spec`
4. `suhuang_list_adapters` and `suhuang_list_providers`
5. `suhuang_prepare_grading`
6. After the operator confirms, `suhuang_start_grading` with `confirm=true`
7. Poll `suhuang_get_status`; use `suhuang_control_grading` with a second
   explicit confirmation for pause, resume, stop, retry, or submit.

The preparation tool is intentionally read-only. Live starts are separate and
always use `manual_confirm`; the Runtime may call the configured vision model,
but score writeback is only requested by an explicit `submit` control action.

## Live grading boundary

Starting automation, writing scores, submitting scores, or reading private run
records must be explained to the operator. Ask for explicit confirmation before
each live MCP action. Never set an automatic-submit mode through the Plugin.

## Fallback CLI commands

When MCP is unavailable, use the installed `suhuang` command (or the repository
CLI) for the same read-only checks:

```bash
suhuang doctor --format json
suhuang specs list
suhuang validate-spec --spec <path>
suhuang adapters list
suhuang providers list
suhuang status
suhuang start --spec <path> --dev --no-watch
suhuang manual-action submit
suhuang stats --format json
```

Do not include `--include-records` unless the operator explicitly asks for
private run records and understands that OCR text and student identifiers may
be present.
