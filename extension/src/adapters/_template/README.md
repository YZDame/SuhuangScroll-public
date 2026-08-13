# Site Adapter Template

Copy this directory to `extension/src/adapters/<site-id>/`.

Then rename:

- `index.ts.tmpl` -> `index.ts`
- `capture.ts.tmpl` -> `capture.ts`
- `page-context.ts.tmpl` -> `page-context.ts`
- `descriptors.ts.tmpl` -> `descriptors.ts`

Replace:

- `templateSite`
- `Template Site`
- `template-site.example`
- selector candidates
- page-context keys

New adapters should start as capture/context/healthcheck adapters. Keep write and submit unsupported until healthcheck and dry-run behavior are verified on a real grading page.

Registration checklist:

- Register the adapter in `extension/src/adapters/index.ts`.
- Add host permissions and content-script matches in `extension/manifest.json`.
- Add conservative metadata to `tools/config/site_adapters.json`.
- Build the extension with `npm run build` from `extension/`.

