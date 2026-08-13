---
name: suhuang-adapter
description: "Use when scaffolding, generating, wiring, or validating a new Suhuang Scroll grading-site adapter: create disabled descriptor-first adapter scaffolds, inspect site adapter manifests, plan Chrome extension adapter files, and guide healthcheck/dry-run validation without enabling live auto-submit prematurely."
---

# Suhuang Adapter

Create and validate Suhuang Scroll grading-site adapters. Keep website automation details in adapters; do not put site selectors, DOM assumptions, or submit behavior into question specs or generic grading code.

## Use For

- Generating a disabled adapter scaffold for a new grading site.
- Deciding whether a site should be capture-only, descriptor-first, or a custom TypeScript adapter.
- Updating `core/python/resources/site_adapters.json` lifecycle metadata.
- Planning files under `extension/src/adapters/<site-id>/` or `extension/src/adapters/generated/<site-id>/`.
- Running safe checks such as `adapters list`, `adapters inspect`, build checks, and browser healthcheck guidance.

Do not enable `autoSubmitEnabled`, mark an adapter `enabled`, perform real score submission, or run long live workflows without explicit user confirmation.

## Repo Context

Default repo path:

```bash
cd <repository-root>
```

Useful files:

- CLI: `core/python/cli.py`
- Adapter manifest: `core/python/resources/site_adapters.json`
- Lightweight SDK guide: `docs/site-adapter-sdk.md`
- Adapter template: `extension/src/adapters/_template/`
- Adapter core contract: `extension/src/adapters/core/site-adapter.ts`
- Descriptor utilities: `extension/src/adapters/core/descriptor.ts`
- Browser adapter registry: `extension/src/adapters/index.ts`

## Design Boundary

Site adapters keep grading-site details behind a small browser execution
surface. CLI/TUI and the local API own run configuration, grading state, model
selection, and submit policy. The Chrome extension is the stable browser host:
it resolves an adapter and executes narrow actions in the active tab.

```text
CLI / TUI
  -> local API automation state
  -> Chrome extension background worker
  -> site adapter registry
  -> content script descriptors and site-specific submit code
```

Adapters are not general RPA plugins. They expose grading operations such as
`captureCurrentAnswer`, `writeScore`, and `submitScore`; selectors, DOM probing,
and network-submit details stay inside concrete adapters.

Treat `docs/site-adapter-sdk.md` as the source of truth for the lightweight SDK.
The SDK is a source-template workflow, not dynamic remote code loading. New
adapters are compiled into the extension after review and validation.

Built-in adapter status can drift, so verify with `python core/python/cli.py adapters
list`. Common built-ins are:

- `zhixue`: production adapter with capture, context, write, submit, batch
  submit, observation, and healthcheck.
- `readboy`: partial adapter for capture, context, observation, and healthcheck;
  write/submit remain unsupported.
- `dongni`: registered adapter with capture, context, DOM write/submit,
  observation, and healthcheck; auto-submit remains disabled until validation.

## Scaffold First

Prefer the built-in generator before writing files by hand:

```bash
python core/python/cli.py adapters generate \
  --target-url "https://example.com/grading/page" \
  --site-name "Example Grading" \
  --grading-mode single
```

Use `--grading-mode fill_blank` for blank-level batch scoring, or `--grading-mode capture_only` when the site is not safe for write/submit work.

If descriptors are not enough and custom behavior is likely needed, add:

```bash
--descriptors-insufficient
```

The generator writes a disabled scaffold under:

```text
extension/src/adapters/generated/<adapter-id>/
```

Expected generated files include `adapter.manifest.json`, `descriptors.json`, `descriptors.ts`, and `validation-probes.json`. An `index.ts` skeleton appears only when `--descriptors-insufficient` is used.

## Adapter Scope

Choose the smallest safe scope:

- `capture_only`: answer image and page context only; write/submit stay unsupported.
- Descriptor-first adapter: descriptors cover targets, but auto-submit remains blocked until manual validation.
- Custom adapter: use TypeScript only when descriptors cannot express the site behavior.

Generated adapters must start disabled. Keep `autoSubmitEnabled: false` until live validation and explicit enablement.

## Manifest Rules

When editing or reviewing `core/python/resources/site_adapters.json`:

- Adapter ids must match the browser adapter `id`.
- New or generated adapters should use `status: "disabled"` or `status: "registered"`.
- `autoSubmitEnabled` must remain `false` until healthcheck and dry-run submit pass.
- Use `failed_healthcheck` for adapters that should stay visible as failing validation targets.
- Prefer disabling manifest status before deleting adapter code.

Manifest top-level fields are `manifestSchemaVersion`, `default_adapter`,
`adapterStatusValues`, and `adapters`. Each adapter entry should include `id`,
`displayName`, `version`, `siteUrls`, `capabilities`, `status`, `createdBy`,
`lastValidatedAt`, `minScrollVersion`, `autoSubmitEnabled`, `rollback`, and
operator-facing `notes`.

Status meanings:

- `registered`: known but not production-validated.
- `validated`: healthcheck and dry-run validation passed, but auto-submit is not enabled.
- `enabled`: validation passed; auto-submit may run only when `autoSubmitEnabled` is also `true`.
- `disabled`: unavailable for new runs.
- `failed_healthcheck`: unavailable because validation failed and needs review.

To disable a bad adapter, set `status` to `disabled`, set `autoSubmitEnabled` to
`false`, add a reason in `notes` or `rollback`, then restart active automation
and reload the extension if the adapter was already loaded.

## Extension Wiring

For a hand-written adapter, copy the SDK template first:

```text
extension/src/adapters/_template/
```

Then create:

```text
extension/src/adapters/<site-id>/
```

Common files:

- `index.ts`: exports `SiteGradingAdapter`.
- `capture.ts`: answer image descriptors or helpers.
- `page-context.ts`: site-specific context extraction.
- `descriptors.ts`: validation descriptors.

Register the adapter in `extension/src/adapters/index.ts`. If content-script routing needs site-specific behavior, wire only narrow helper calls and keep selectors out of generic capture code.

Also update `extension/manifest.json` host permissions and content-script
matches for the target website. Chrome extension permissions are static, so a
new source-level adapter usually requires rebuilding/reloading the extension.

## Validation

Safe validation sequence:

1. Run `python core/python/cli.py adapters list`.
2. Run `python core/python/cli.py adapters inspect <adapter-id>` if the adapter is in the manifest.
3. Build or check the extension when adapter files changed.
4. Open a representative grading page with the Chrome extension loaded.
5. Run sidepanel `Healthcheck`.
6. Inspect `answerImage`, `scoreInput`, `submitButton`, `batchScoreInputs`, and `nextItemSignal` probes as relevant.
7. Test capture and page context before any write/submit path.
8. Use dry-run submit only. Do not perform real submission unless the user explicitly confirms.

Only after these pass should the manifest move toward `validated`; move to `enabled` and `autoSubmitEnabled: true` only with explicit production approval.

## Completion Checklist

- Adapter id, site name, target URL, and grading mode are recorded.
- Generated scaffold or file edits are listed.
- Manifest status remains conservative unless validation justifies otherwise.
- Extension build/check result is reported if code changed.
- Browser healthcheck or dry-run status is reported if actually performed.
- No live submit was run without explicit confirmation.
