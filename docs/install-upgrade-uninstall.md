# Install, upgrade, and uninstall

Suhuang Scroll release archives contain native TUI, CLI, and backend executables.
Python, Node.js, Rust, and administrator access are not required.

## macOS and Linux

Install the latest release:

```bash
curl -fsSL https://raw.githubusercontent.com/YZDame/SuhuangScroll-public/main/scripts/install/install.sh | bash
```

Install a specific release:

```bash
curl -fsSL https://raw.githubusercontent.com/YZDame/SuhuangScroll-public/main/scripts/install/install.sh |
  bash -s -- --version v0.6.0
```

The installer detects `macos-arm64`, `macos-x64`, or `linux-x64`, downloads the
matching GitHub Release archive and `.sha256`, verifies it, and installs under
`~/.local/suhuang-scroll`. The command shim is `~/.local/bin/suhuang`. Add that
directory to `PATH` when the installer prints the prompt.

## Windows

From PowerShell:

```powershell
irm https://raw.githubusercontent.com/YZDame/SuhuangScroll-public/main/scripts/install/install.ps1 |
  iex
```

For a specific release, download the script and run:

```powershell
.\install.ps1 -Version v0.6.0
```

The default program directory is `%LOCALAPPDATA%\Suhuang Scroll`; the command
shim is placed under `%LOCALAPPDATA%\Suhuang\bin` and that directory is added to
the current user's `PATH`. Open a new terminal after first installation.

## Upgrade and user data

Run the same installer with `latest` or a specific newer version. Program files
are replaced atomically after checksum and layout validation. User data remains
outside the install directory:

| Platform | Configuration | Specs, runs, and runtime data |
| --- | --- | --- |
| macOS | `~/Library/Application Support/Suhuang Scroll/config.json` | `~/Library/Application Support/Suhuang Scroll/workspace/` |
| Linux | `${XDG_CONFIG_HOME:-~/.config}/suhuang-scroll/config.json` | `${XDG_DATA_HOME:-~/.local/share}/suhuang-scroll/workspace/` |
| Windows | `%APPDATA%\Suhuang Scroll\config.json` | `%APPDATA%\Suhuang Scroll\workspace\` |

Upgrading or removing program files does not delete these directories.

## Uninstall

macOS/Linux program files and shim:

```bash
rm -rf "$HOME/.local/suhuang-scroll"
rm -f "$HOME/.local/bin/suhuang"
```

Windows program files and shim:

```powershell
Remove-Item -Recurse -Force "$env:LOCALAPPDATA\Suhuang Scroll"
Remove-Item -Force "$env:LOCALAPPDATA\Suhuang\bin\suhuang.cmd"
```

The installer may create `suhuang-*` links under `~/.agents/skills`. Remove only
links that point into the removed install directory. Delete the configuration
or workspace directories separately only when their settings, Specs, and run
history are no longer needed.
