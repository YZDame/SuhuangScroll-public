# Chrome Web Store listing draft

## Name

Suhuang Scroll Bridge

## Short description

Connect supported grading websites to the local Suhuang Scroll Runtime.

## Detailed description

Suhuang Scroll Bridge is the browser-side execution layer for Suhuang Scroll,
an operator-controlled AI-assisted grading Runtime.

The extension provides a side panel and narrow adapter actions for supported
grading pages: capture the current answer, read page context, observe a page
change, run adapter health checks, and (when the operator explicitly chooses
it) write or submit a score through the configured workflow.

Before any grading-page data is read, the side panel displays a prominent data
notice and requires affirmative operator consent. Revoking consent stops the
page-image observer, asks the local Runtime to stop an active automation run,
and blocks subsequent grading actions until consent is given again.

The extension does not decide grades. The local Suhuang Scroll Runtime owns
question specs, model calls, grading decisions, run state, and review policy.

For store review and local smoke tests, the public package also contains a
synthetic fixture under `fixture/synthetic-grading.html`. It is reachable only
through a local `localhost`/`127.0.0.1` page, contains no student data, and does
not make network requests. It is not a production grading website.

Install the local Runtime separately, configure a vision provider, then load the
extension on a supported grading site. Keep the extension disabled on pages
that are not part of an active grading workflow.

## Public policy and support links

Publish these files at stable HTTPS URLs before submitting the item. The
repository paths are the canonical source documents for the release package:

- Privacy policy: `extension/store/privacy-policy.md`
- Terms of service: `extension/store/terms-of-service.md`
- Support: publish a monitored `https://<public-site>/support/` URL. The
  checked-in reference site uses `support@suhuangscroll.com`.

The Chrome Web Store listing must use the deployed HTTPS URLs, not repository
paths or a private-repository link. Keep the deployed text synchronized with
the checked-in documents.

## Graphic assets

Upload these checked-in assets in the Chrome Web Store Developer Dashboard:

- Store icon: `public/icons/icon128.png`
- Required screenshot: `store/assets/screenshot-runtime-bridge.png` (1280x800)
- Required small promotional tile: `store/assets/promo-small.png` (440x280)

The screenshot uses synthetic demonstration values and contains no student
records. Regenerate or replace it whenever the side-panel flow changes. Check
the dimensions before uploading:

```bash
python scripts/release/check_chrome_store_assets.py
```

## Permission justification

| Permission | Purpose |
| --- | --- |
| `sidePanel` | Display the operator controls and readiness information. |
| `storage` | Persist local UI/runtime preferences in Chrome storage. |
| `activeTab`, `tabs`, `scripting` | Inspect and act on the selected supported grading tab after the operator invokes an action. |
| Supported-site host permissions | Run the registered site adapter on grading pages. |
| `localhost` / `127.0.0.1` host permissions | Communicate with the operator's local Suhuang API; no hosted Suhuang service is contacted by default. |

## Privacy disclosure

The extension has no analytics or advertising. It does not transmit browser
cookies or credentials to Suhuang Scroll servers. When the operator starts a
consented grading action, the local Runtime may send captured answer images to
the vision provider selected in local configuration. See
[`docs/plugin-privacy-policy.md`](../docs/plugin-privacy-policy.md) for the
full notice and publish that notice at a stable HTTPS URL before submission.
