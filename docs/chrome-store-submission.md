# Chrome Web Store publication checklist

当前已验证的公开站点 origin 是
`https://yzdame.github.io/SuhuangScroll-public/`。Chrome Web Store listing
本身仍需在开发者后台完成上传、审核和发布；候选包可从公开 `v0.6.4`
Release 下载。

## Package

```bash
npm ci --prefix extension
npm run build --prefix extension
python scripts/release/package_extension.py \
  --version 0.6.4 \
  --channel chrome-store \
  --public-base-url "$SUHUANG_PUBLIC_BASE_URL" \
  --output dist/release/SuhuangScroll-Bridge-ChromeStore-public-v0.6.4.zip
python scripts/release/check_chrome_store_package.py \
  dist/release/SuhuangScroll-Bridge-ChromeStore-public-v0.6.4.zip \
  --version 0.6.4 \
  --public-base-url "$SUHUANG_PUBLIC_BASE_URL"

python scripts/release/package_chrome_store_listing.py \
  --public-base-url "$SUHUANG_PUBLIC_BASE_URL" \
  --package-archive "dist/release/SuhuangScroll-Bridge-ChromeStore-public-v0.6.4.zip"
python scripts/release/check_chrome_store_listing.py \
  dist/release/SuhuangScroll-ChromeStore-listing-v0.6.4.json \
  --public-base-url "$SUHUANG_PUBLIC_BASE_URL" \
  --require-package
```

The upload archive must have `manifest.json` at its root and must not include
source maps, `vite.svg`, or macOS metadata files.

## Listing review

- [x] Prepare the listing copy in `extension/STORE_LISTING.md` and the generated
      listing worksheet.
- [x] Explain every permission, especially supported-site access and localhost
      access, in the source worksheet. Repeat the review in the Chrome dashboard.
- [x] Host the privacy policy at the verified Pages URL:
      `https://yzdame.github.io/SuhuangScroll-public/privacy/`.
- [ ] Activate and monitor the HTTPS support contact before submitting the
      listing; the public support page is
      `https://yzdame.github.io/SuhuangScroll-public/support/`.
- [x] Host the terms page at the verified Pages URL:
      `https://yzdame.github.io/SuhuangScroll-public/terms/`.
- [ ] Provide current screenshots of the side panel and a supported test page.
- [x] Keep the required 1280x800 screenshot, 440x280 small promo tile, and
      128x128 icon in `extension/store/assets/` and validate their dimensions.
- [x] Require affirmative data consent before reading grading-page data, stop
      the page observer when consent is revoked, and keep the policy copy in
      sync with the implementation.
- [x] Validate the generated listing worksheet against the source manifest,
      permission justifications, public URLs, assets, and upload archive.
- [x] Ship a deterministic synthetic review fixture and a local server command;
      the fixture contains no student data and makes no network request.
- [x] Smoke-check a fresh unpacked install with the side panel open, Runtime
      unavailable state, and local API ready state; the temporary test uses no
      student data and does not invoke grading.
- [ ] Test adapter healthcheck and a synthetic dry-run from the installed
      Chrome Web Store candidate. Use the checked-in fixture after serving it:

      ```bash
      python scripts/release/serve_chrome_fixture.py
      # open http://127.0.0.1:8765/fixture/synthetic-grading.html
      ```

      Then grant data consent, run `开发者模式 → 健康检查`, and use the dry-run
      actions. The local `write_score`/`submit_score` dry-run path does not
      require a Runtime license and never sends a network request.
- [ ] Test uninstall/reinstall and confirm local records are not silently
      uploaded or deleted.

After the public site is deployed, `package_chrome_store_listing.py` writes a
machine-readable worksheet containing the listing copy, deployed policy URLs,
permission justifications, privacy-practice disclosures, and asset paths. It
does not submit the item or certify the dashboard's legal declarations.
`check_chrome_store_listing.py` verifies that worksheet against the source
manifest, checked-in assets, and the candidate upload archive before review.

For a repeatable CI candidate, manually trigger
`.github/workflows/public-store-candidates.yml` with the deployed HTTPS origin
and registered Plugin App ID. The workflow uploads the three candidate archives
and the listing worksheet as one artifact.

Real score writeback and submission are intentionally excluded from the release
smoke test unless the operator explicitly confirms a controlled test account.
