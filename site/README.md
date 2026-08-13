# Suhuang Scroll public pages

This directory is a dependency-free static site for the public Plugin and Chrome
Store metadata. Deploy it at an HTTPS origin with these stable paths:

- `/`
- `/docs/`
- `/privacy/`
- `/terms/`
- `/support/`

Set `SUHUANG_PUBLIC_BASE_URL` to that origin when building the public Codex
Plugin candidate:

```bash
export SUHUANG_PUBLIC_BASE_URL="https://your-real-domain.example"
python scripts/release/package_codex_plugin.py \
  --channel public \
  --public-base-url "$SUHUANG_PUBLIC_BASE_URL" \
  --output dist/release/SuhuangScroll-CodexPlugin-public-v0.1.0.zip
```

Replace the example domain with the deployed origin. The public site must not be
published with private repository paths, credentials, or student data.

The public submission flow does not require an App ID. If you also test the
connection in developer mode, pass the real technical ID with `--app-id` to add
optional `.app.json` compatibility wiring.

The repository includes `.github/workflows/public-site.yml` for GitHub Pages.
After enabling Pages with **GitHub Actions** as the source, a release on `main`
deploys this directory. Configure a custom domain in the repository's Pages
settings only after confirming that no other public site owns that hostname;
keep the resulting HTTPS origin in `SUHUANG_PUBLIC_BASE_URL`. The source tree
intentionally does not pin a CNAME so the public origin remains an explicit
deployment choice.
