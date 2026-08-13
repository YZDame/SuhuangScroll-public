# Browser Executor Actions

The browser extension should expose only a small set of stable actions to the Agent.

## Core actions

1. `capture_current_answer`
Returns answer image data, dimensions, and capture source.

2. `get_page_context`
Returns page URL, title, site identity, and submission context like `paperIndex` when available.

3. `observe_page_change`
Lets the Agent detect that the answer image or question context has changed.

4. `write_score`
Writes the score without committing final submission.

5. `submit_score`
Triggers final submission and returns method, timestamp, and error details.

6. `submit_batch_scores`
Submits per-blank or per-item scores for a fill-blank question.

7. `grade_current_answer`
Extension-internal orchestration helper that captures, sends the current image
to the local API, and optionally submits. This is useful for debugging, but it
is not a browser-side adapter primitive.

## Stable action contracts

These are the browser actions the CLI/API side should depend on while the
implementation moves behind site adapters.

| Action | Request shape | Success response shape | Current implementation |
| --- | --- | --- | --- |
| `capture_current_answer` | `{ tabId?, selector? }` | `{ success, imageData?, width?, height?, source?, imageHash? }` | Runtime message `GET_PAGE_IMAGE` handled by `src/content/capture.ts`. |
| `get_page_context` | `{ tabId? }` | `{ success, pageUrl?, pageTitle?, site?, paperIndex?, questionId? }` | Runtime message `GET_PAGE_CONTEXT` handled by `src/content/page-context.ts`. |
| `observe_page_change` | `{ tabId? }` | `{ success, previousHash?, currentHash?, pageContext?, message? }` | Runtime message `OBSERVE_PAGE_CHANGE`; background passes a 10s timeout. |
| `write_score` | `{ tabId?, input: { paperIndex, score } }` | `{ success, paperIndex?, score?, timestamp?, method?, message, error? }` | `ZhixueBrowserAdapter.writeScore` via DOM bridge. |
| `submit_score` | `{ tabId?, input: { paperIndex, score, studentId?, reason?, questionId?, subject? } }` | `{ success, paperIndex?, score?, timestamp?, method?, message, response?, details? }` | `ZhixueBrowserAdapter.submitScore`; POST submit first, DOM submit fallback. |
| `submit_batch_scores` | `{ tabId?, input: { paperIndex, batchScores, reason? } }` | Same envelope as `submit_score`. | `ZhixueBrowserAdapter.submitBatchScores` via batch DOM bridge. |
| `healthcheck` | `{ tabId?, adapterId? }` | `{ success, adapterId, matched?, checks?, probes?, validationPassed?, requiredChecks?, failures?, message?, error? }` | Resolved adapter `healthcheck`. |

Unsupported or malformed actions should return `{ success: false, error }`.
The next adapter phases should preserve these envelopes even when the concrete
site implementation changes.

All `AGENT_BROWSER_ACTION` messages may include `adapterId` as a debug override.
Automation-run adapter selection still comes from local API state.

## Adapter routing behavior

The background worker routes these stable actions through the site adapter
registry. Adapter resolution uses:

1. Explicit automation run adapter id when available.
2. Active tab URL.
3. Page context site id as a fallback.

The resolved adapter receives the action through its `SiteGradingAdapter`
method. Missing adapters and unsupported capabilities return structured
`{ success: false, error, details? }` responses rather than changing the action
contract.

Sidepanel adapter selection is debug state only. It can be used to manually test
capture, context, write, submit, and healthcheck through a selected adapter, but
it does not override a CLI/TUI-started automation run. Production runs get their
adapter id from local API automation state.

Auto-submit paths run adapter validation before committing a score. The
background worker calls `healthcheck`, verifies question-type-specific targets,
and then performs a dry-run submit. If validation fails, submission is blocked.

## Current background entrypoint

The minimal stable entrypoint is a background runtime message:

```ts
await chrome.runtime.sendMessage({
  type: 'AGENT_BROWSER_ACTION',
  action: 'capture_current_answer',
  tabId,
})
```

Supported now:

- `capture_current_answer`
- `get_page_context`
- `observe_page_change`
- `write_score`
- `submit_score`
- `submit_batch_scores`
- `healthcheck`

`observe_page_change` is exposed through the background entrypoint with a fixed
timeout for manual calls. Automation also performs post-submit capture checks to
confirm that the current answer changed.

## Current code mapping

- Adapter contract: [`src/adapters/core/site-adapter.ts`](./src/adapters/core/site-adapter.ts)
- Adapter registry: [`src/adapters/core/registry.ts`](./src/adapters/core/registry.ts)
- Descriptor layer: [`src/adapters/core/descriptor.ts`](./src/adapters/core/descriptor.ts)
- Built-in registration: [`src/adapters/index.ts`](./src/adapters/index.ts)
- Runtime content-script adapter: [`src/adapter/runtime-browser-adapter.ts`](./src/adapter/runtime-browser-adapter.ts)
- Zhixue adapter: [`src/adapters/zhixue/`](./src/adapters/zhixue/)
- Readboy adapter: [`src/adapters/readboy/`](./src/adapters/readboy/)
- Adapter contracts: [`src/adapter/contracts.ts`](./src/adapter/contracts.ts)

## Current site-specific execution layer

The built-in concrete execution layers are:

- Zhixue full adapter: capture, page context, DOM write/submit, network submit,
  batch submit, observation, and healthcheck.
- Readboy partial adapter: capture, page context, observation, and healthcheck;
  write/submit actions return unsupported-capability responses.
- Synthetic review fixture: local-only capture, page context, descriptor healthcheck,
  and dry-run/write demonstrations; it never calls a grading website or network.

At the protocol level, the Agent should still treat these as `write_score` and
`submit_score`, not as site-specific product logic.

## Current runtime message shape

The codebase still contains older runtime message names such as
`SCORE_BRIDGE_EXECUTE`. Those are implementation details behind the stable
background action entrypoint above.

## Product boundary

- The extension does not decide grades.
- The extension does not own main workflow state.
- The extension is an executor for browser-side actions.

## Known gaps

- Content-script helper routing still has explicit adapter-id branches for each
  supported site. New adapters must add those branches until content routing is
  made fully descriptor-driven.
- Readboy is a partial adapter and cannot write or submit scores yet.
- `grade_current_answer` combines capture, local API grading, and submit in the
  background worker. It should remain orchestration glue, not move into a site
  adapter.
- Dry-run `write_score`, `submit_score`, and `submit_batch_scores` requests are
  allowed to bypass the local Runtime license probe because adapters must resolve
  their targets without writing or submitting data. Consent is still required.
