# MCP submission test cases

Local-bridge cases use the public synthetic spec at
`workspace/specs/minimal-fill-blank-spec.md` and a local Runtime. No student
data or live website account is required.

Hosted-relay cases can run `services/mcp-control-plane` with a paired local
Runtime Agent, or with the explicit `SUHUANG_MCP_REVIEW_MODE=fixture` review
tenant. The fixture tenant uses only public synthetic data and never starts a
Runtime process. The relay's queueing annotations are intentionally
`readOnlyHint: false`; live action tools additionally set `destructiveHint: true`
and require `confirm=true`.

## Positive cases

1. `suhuang_runtime_status` returns the discovered CLI path and does not start
   a process that changes grading state.
2. `suhuang_doctor` returns structured diagnostics with `remote_probe_performed`
   unchanged when no remote probe was requested.
3. `suhuang_list_specs` returns the synthetic spec with `status: valid` and
   does not include its full answer body.
4. `suhuang_validate_spec` accepts the synthetic spec and returns the Runtime's
   parsed contract.
5. `suhuang_prepare_grading` returns `ready: true` plus
   `gradingStarted: false`, `scoreWritten: false`, and `scoreSubmitted: false`.
6. Hosted `/healthz`, MCP `initialize`, and `tools/list` work with the review
   token. In fixture mode, `suhuang_runtime_status`, `suhuang_list_specs`, and
   `suhuang_prepare_grading` return deterministic synthetic results without a
   queue; in relay mode, `suhuang_runtime_pair` returns a one-time code and a
   paired Agent can complete `suhuang_runtime_status` through the transient
   queue.
7. In fixture mode, `suhuang_start_grading` with `confirm: true` returns
   `gradingStarted: false` and never starts a process; an unconfirmed
   `suhuang_control_grading` call is rejected before queueing.

## Negative cases

1. `suhuang_validate_spec` with a nonexistent path returns an MCP tool error;
   it must not create a file or start grading.
2. `suhuang_prepare_grading` with an unknown adapter returns an MCP tool error;
   it must not fall back to a different adapter silently.
3. `suhuang_get_stats` with `includeRecords: true` and `limitRecords: 0`
   rejects the arguments before invoking the Runtime.
4. Hosted MCP calls without a valid bearer token return HTTP 401; calls with a
   relative-path violation or an offline Agent return a structured safe error.
5. A Runtime pairing code can be redeemed once only; a second redemption returns
   HTTP 401 and cannot create another Agent session.

## Live action boundary

`suhuang_start_grading` starts only a `manual_confirm` run after `confirm: true`.
`suhuang_control_grading` can pause, resume, stop, retry, or confirm the
currently pending decision; `submit` is the only action that asks the paired
Chrome adapter to write/submit the current score. Automatic submission and
arbitrary score payloads are not exposed through MCP.
