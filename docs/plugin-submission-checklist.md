# Codex Plugin publication checklist

This checklist separates repository readiness from external publication
requirements. It is intentionally not a claim that the current checkout has
already passed marketplace review.

## In-repository checks

- [x] `.codex-plugin/plugin.json` validates.
- [x] `interface.logo` and `interface.composerIcon` point to checked-in release
      assets; add final screenshots in the submission portal when the UI is
      part of the listing.
- [x] `skills/` contains no author-machine paths or private fixtures.
- [x] `.mcp.json` starts the local bridge with `node mcp/server.mjs`.
- [x] `schemas/` contains only public v1 contracts.
- [x] Local bridge and hosted relay expose annotations that match their actual
      behavior (`readOnlyHint: true` locally; queueing relay calls are marked
      non-read-only even when the local operation is read-only).
- [x] The Plugin README explains the separate Runtime and Chrome installation.
- [x] The public packager rewrites public website, policy, terms, and homepage
      URLs without mutating the local source manifest; it can optionally add
      developer-mode `.app.json` wiring.
- [x] `check_codex_plugin_archive.py` verifies the public archive's optional
      `.app.json` wiring, required assets, and deployed URL set.
- [x] `package_codex_submission.py` generates the listing, MCP/OAuth, starter
      prompts, 5 positive tests, 3 negative tests with fixture/result-shape
      fields, availability, release notes, and archive checksum worksheet
      without storing credentials.
- [x] `check_codex_submission.py` validates the generated worksheet and package
      checksum before a public candidate workflow uploads it.
- [x] The public candidate workflow preflights the deployed site, MCP health,
      protected-resource metadata, OAuth discovery, PKCE, token endpoint
      authentication, MCP 401 challenge, and modern MCP discovery before
      producing store artifacts.
- [x] When a short-lived reviewer token is supplied, the public endpoint
      preflight also validates `tools/list`, required tool names and schemas,
      confirmation/destructive annotations, and the `suhuang:runtime` OAuth
      scope before producing store artifacts.
- [x] Public Plugin packaging requires an explicit public Runtime release
      repository and rewrites installer instructions away from the private
      development repository.
- [x] `check_public_runtime_release.py` verifies anonymous installer access and
      the four native Runtime archives, and confirms both installers default to
      that public repository before public candidates are generated.
- [x] Hosted MCP negotiates supported protocol versions, validates modern
      transport headers, and has an exact-match browser Origin allowlist.
- [x] Hosted MCP has an opt-in, tenant-scoped synthetic reviewer mode so
      Scan Tools can exercise positive calls without a private local Runtime;
      production tenants remain on the paired-agent path.
- [x] Live MCP controls require `confirm=true`, force `manual_confirm` runs,
      and expose no arbitrary score payload or automatic-submit mode.

Local archive command:

```bash
python scripts/release/check_plugin_package.py
python scripts/release/package_codex_plugin.py
```

## Before public submission

- [ ] Deploy `services/mcp-control-plane` at a stable HTTPS MCP endpoint. A
  local stdio command is a development/desktop bridge, not a public hosted
  endpoint.
- [ ] In the Plugin submission portal, enter the public Hosted MCP URL and run
  Scan Tools. A developer-mode `.app.json` connection ID is optional and must
  never be guessed or committed.
- [ ] If developer-mode compatibility wiring is needed, build the candidate with
  `scripts/release/package_codex_plugin.py --app-id "$SUHUANG_PLUGIN_APP_ID"`
  and run the archive checker with `--require-app-id`.
- [ ] Configure the hosted endpoint with OAuth 2.1/JWKS validation and map the
  authenticated subject to a tenant; static token maps are for local/reviewer
  demo only.
- [ ] Publish privacy, support, and (if required by the listing) terms pages at
  stable HTTPS URLs.
- [ ] Verify publisher/developer identity and repository ownership.
- [ ] Create or confirm the public Runtime release repository used by the
      `--release-repo` input; verify its release assets and installer scripts
      are reachable without authentication.
- [x] Prepare positive and negative test cases for each exposed tool; the
      generated worksheet contains 5 positive and 3 negative cases.
- [x] Review the local tool annotations, per-tool OAuth `securitySchemes`, and
      confirmation wording against the current official Plugin submission
      guidance. Repeat the same review in the submission portal after Scan Tools.

## Live action boundary

`suhuang_start_grading` starts only a manual-confirmation run after an explicit
operator confirmation. `suhuang_control_grading` handles pause, resume, stop,
retry, and the current pending decision's submit action. Arbitrary score
payloads and automatic submission remain unavailable through MCP.
