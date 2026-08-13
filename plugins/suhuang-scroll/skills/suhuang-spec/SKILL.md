---
name: suhuang-spec
description: "Use when working on Suhuang Scroll grading standards: create, rewrite, validate, or improve question spec files for single or fill_blank questions, turn answer keys into executable rubrics, and hand off the final start command without running long grading jobs."
---

# Suhuang Spec

Create and validate Suhuang Scroll question specs. Treat the spec as the grading contract; CLI, TUI, browser extension, and site adapters are execution plumbing.

## Use For

- Turning an answer key, rubric, or scoring standard into a `question_spec` Markdown file.
- Improving an existing spec after validation errors or grading-quality issues.
- Writing `single` subjective-question specs and `fill_blank` answer specs.
- Running short spec/schema validation checks.
- Giving the user the final CLI command or TUI path after validation.

Do not start `python core/python/cli.py start ...` by default. Long grading runs may use live accounts and submit real scores. Ask explicitly before any real submission, batch grading, or long-running workflow.

## Runtime Context

Use the current workspace or the path configured by `SUHUANG_ROOT`. An
installed Plugin must not assume the author's checkout path. Prefer the MCP
`suhuang_validate_spec` tool and use the installed `suhuang` CLI as fallback.

Useful files:

- CLI: `core/python/cli.py`
- Question schema: `core/python/core/contracts.py`
- Spec parser: `core/python/services/spec_service.py`
- Active specs: `workspace/specs/`

Prefer paths like:

```text
workspace/specs/<exam-or-paper>-q<question-number>_spec.md
```

## Contract Boundary

The spec is the grading contract. Stable local objects include `question_spec`,
`execution_config`, `grade_job_result`, `save_record_payload`, and
`submit_payload`; their source of truth is `core/python/core/contracts.py`.

Do not copy browser-site assumptions, adapter selectors, or submit behavior into
spec files. Keep those in `suhuang-adapter` work and extension adapters.

When explaining execution flow, use this boundary:

1. Prepare `question_spec`.
2. Capture the current answer image through the browser/adapter layer.
3. Choose execution mode such as `agent_primary` or `agent_with_ocr_assist`.
4. Use OCR only when it improves cost or stability.
5. Produce structured grading output.
6. Save a grade record before submission.
7. Submit only when policy allows it and the user has confirmed live grading.

## Workflow

1. Collect only details that block spec generation: question id, subject, type, full score, accepted answers, partial-credit rules, target exam or site if relevant.
2. Inspect the local schema if needed:

```bash
suhuang schema --name question_spec
```

3. Write or update the spec.
4. Validate it:

```bash
suhuang validate-spec --spec <path>
```

5. Fix structural validation errors before giving a start command.
6. Handoff the command, but do not run it unless the user explicitly asks.

## Rubric Design

Write specs for machine execution, not as a copy of a human answer key.

- Score by evidence, not by exact reference-solution order.
- Keep scoring points locally independent where possible.
- Allow equivalent forms, methods, notation, and answer order when valid.
- Allow reverse evidence: a correct later result can prove an earlier quantity was obtained.
- Replace vague language such as "酌情给分" with fixed numeric rules.
- Avoid repeated deductions for the same missing or mistaken idea.
- Separate OCR uncertainty from mathematical correctness when possible.

Useful wording:

- "若未单独写出 X，但后续正确使用 X，可视为 X 已有效获得。"
- "列出正确方程但未求解，固定给 1 分。"
- "公式正确但计算错误，固定保留公式分。"
- "最终结果正确且过程可支撑主要推理，不因中间结论未单列重复扣分。"
- "答案写成等价形式均判正确。"

## Templates

For subjective math/science `single` specs, read `references/single-template.md`.

For `fill_blank` specs, read `references/fill-blank-guidance.md`.

## Final Handoff

After validation passes, provide one of these paths.

Agent CLI handoff:

```bash
suhuang start --spec <spec-path> --adapter <adapter> --confidence-threshold 0.9
```

Human TUI handoff:

```bash
suhuang
```

Tell the user to choose the validated spec and adapter in the TUI and start the run themselves.

## Completion Checklist

- Spec path is provided.
- `validate-spec` passed, or the failure is reported with the next fix.
- Any adapter or environment checks actually run are summarized.
- Long-running/live-submission command is provided but not executed.
