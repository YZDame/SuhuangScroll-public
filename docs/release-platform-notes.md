# Release platform notes

## Supported archives

- macOS Apple Silicon: `macos-arm64.zip`
- macOS Intel: `macos-x64.zip`
- Windows x64: `windows-x64.zip`
- Linux x64: `linux-x64.tar.gz`

Each archive contains the `suhuang` launcher, Rust TUI, frozen Python CLI and
backend, public Skills, a sanitized example Spec, provider/adapter registries,
README, `VERSION`, and `release.json`. GUI/Tauri, source trees, virtual
environments, Node.js dependencies, and private workspace data are excluded.

CI executes the packaged launcher in an isolated user-data directory, runs
`doctor`, starts the TUI smoke mode and embedded backend, validates the protocol,
then verifies the backend process has exited and the package directory was not
used for mutable data.

## Unsigned archive behavior

Release archives are currently unsigned:

- macOS Gatekeeper may quarantine the downloaded archive or binaries. A user may
  need Finder's **Open** confirmation or `xattr -dr com.apple.quarantine <install-dir>`
  after independently verifying the published SHA256.
- Windows SmartScreen may show an unknown-publisher warning. Users should verify
  the SHA256 and choose **More info → Run anyway** only for assets downloaded
  from the official release.

The local build and CI downloads do not reproduce a browser-applied macOS
quarantine attribute or Windows reputation prompt. The documented commands are
therefore recovery guidance, not evidence that every browser download will be
blocked. Record real user reports before changing the signing decision.

Code signing, notarization, `.dmg`, NSIS/MSI, automatic updates, and the frozen
GUI remain paused. Reconsider signing only if real installation reports show
that Gatekeeper or SmartScreen materially blocks ordinary users.
