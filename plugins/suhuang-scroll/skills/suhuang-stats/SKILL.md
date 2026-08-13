---
name: suhuang-stats
description: "Use when analyzing completed Suhuang Scroll grading runs: read workspace/runs data, summarize scores, confidence, timing, records, errors, abnormal samples, and postmortem patterns without rewriting historical run data by default."
---

# Suhuang Stats

Analyze completed Suhuang Scroll grading data. Default to read-only analysis over `workspace/runs/`.

## Use For

- Summarizing score distributions, confidence, timing, and completion state.
- Reading `run.json`, `records.jsonl`, `errors.jsonl`, and `summary.md`.
- Comparing multiple runs or questions.
- Identifying likely failure modes: spec path dependence, OCR, adapter, confidence threshold, or human-AI rubric mismatch.
- Producing concise tables and character charts together by default.

Do not rewrite historical records, old specs, transcripts, or grading outputs unless the user explicitly asks.

## Runtime Context

Use the current workspace or the path configured by `SUHUANG_ROOT`. An
installed Plugin must not assume the author's checkout path. Prefer aggregate
stats through `suhuang_get_stats`; only request private records when the
operator explicitly asks.

Run data usually lives under:

```text
workspace/runs/
```

Useful files inside each run:

- `run.json`: run metadata, state, question id, completed count.
- `records.jsonl`: per-paper grading records.
- `errors.jsonl`: capture, grading, transition, and submit failures.
- `summary.md`: compact human summary.

## CLI Checks

Use the current CLI when it can answer the question:

```bash
suhuang stats --format json
suhuang stats --run-dir <run-dir> --format json --include-records
```

If `session list` is empty while `workspace/runs/` has data, prefer explicit `--run-dir` paths.

## Analysis Workflow

1. Locate relevant runs by user-provided path, question id, timestamp, or latest modified run directory.
2. Inspect metadata first, then records/errors.
3. Aggregate only the fields needed for the question.
4. Present concise tables and character charts before prose.
5. Separate facts from interpretation.

## Default Output Style

Unless the user explicitly asks for another format, present stats with both
tables and character-based charts. Do not output a prose-only wall of text.

Recommended order:

1. Scope table: run directory or run group, question id, status, record count,
   submitted count, error count, time range, and pace.
2. Summary table: max score, average score, median, score rate, full-score
   count, zero-score count, average confidence, and low-confidence count.
3. Score distribution table: exact score or score band, count, percentage.
4. Character chart block for the same distribution.
5. If the question has blanks or subparts, add a per-blank/per-subpart table
   and a matching character chart.
6. Errors and anomalies table: category, count, examples, likely cause.
7. Short conclusion: 2-5 bullets focused on the most important grading pattern
   and any concrete follow-up.

Character chart rules:

- Use monospace fenced blocks.
- Prefer horizontal bars with `█` for filled units and `░` for remainder.
- Label each row with the score, band, blank id, or question id.
- Include both count and percentage when useful.
- Pick a simple scale and state it briefly when counts are shown, for example
  `每个 █ 约 2 人`.
- Keep charts compact; combine rare scores into bands only when exact-score
  distribution would be too wide to read.

Example shape:

```text
总体均分率
q12-14  39.6%  ████████░░░░░░░░░░░░
q15     76.5%  ███████████████░░░░░
q16     31.6%  ██████░░░░░░░░░░░░░░
```

```text
q16 分数分布（每个 █ 约 2 人）
 0分   3人  ██
 4分  91人  ██████████████████████████████████████████████
 9分  12人  ██████
14分   1人  █
```

Useful output sections:

- Run scope: path, question id, status, completed/failed counts.
- Score distribution.
- Confidence distribution or low-confidence samples.
- Timing summary if timestamps are available.
- Error categories and examples.
- Likely causes and next spec/adapter fixes.

For cross-run aggregation, collect `stats --run-dir ... --format json --include-records` per run and aggregate separately.
