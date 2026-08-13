# Suhuang Scroll Bridge Privacy Policy

Last updated: 2026-08-13

Suhuang Scroll Bridge has no advertising, analytics, or telemetry. It stores
only local extension preferences in Chrome storage. Before the first grading
action, the side panel shows a data notice and requires the operator to give
affirmative consent. Until that consent is granted, the bridge does not read
answer images or page context, send grading-page heartbeats, or start its
page-image observer.
If consent is revoked during an active local automation run, the bridge stops
observing the page, blocks further browser actions, and requests that the local
Runtime stop that run.

The extension does not collect or transmit browser cookies, passwords, or
credentials to Suhuang Scroll servers. After consent and an operator-invoked
workflow, the local Runtime may capture answer images and page context from a
supported grading page. If the operator has configured a third-party vision
provider, the Runtime may send those inputs to that provider to produce a
grading decision. The provider's privacy terms apply to that request.

Run records and model outputs remain on the operator's computer according to
the Runtime configuration. Operators should not use the extension with
student data unless their institution's policy permits the selected provider
and retention settings.

For support, use the monitored contact published with the current release.
This policy must be hosted at a stable HTTPS URL and linked in the Chrome Web
Store listing before publication.
