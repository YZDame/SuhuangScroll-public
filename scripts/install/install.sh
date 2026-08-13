#!/usr/bin/env bash
set -euo pipefail

VERSION="latest"
INSTALL_DIR="${SUHUANG_INSTALL_DIR:-$HOME/.local/suhuang-scroll}"
BIN_DIR="${SUHUANG_BIN_DIR:-$HOME/.local/bin}"
SKILLS_DIR="${SUHUANG_SKILLS_DIR:-$HOME/.agents/skills}"
REPO="${SUHUANG_RELEASE_REPO:-YZDame/SuhuangScroll-public}"
FROM_SOURCE=0
SUHUANG_INSTALL_TMP=""

cleanup_installer_tmp() {
  if [[ -n "$SUHUANG_INSTALL_TMP" && -d "$SUHUANG_INSTALL_TMP" ]]; then
    rm -rf -- "$SUHUANG_INSTALL_TMP"
  fi
}
trap cleanup_installer_tmp EXIT

usage() {
  cat <<'USAGE'
Usage: install.sh [--version latest|vX.Y.Z|X.Y.Z] [--install-dir DIR] [--bin-dir DIR] [--repo OWNER/REPO] [--from-source]

By default this installer downloads a GitHub Release native package, verifies
its checksum, installs it under a user-local directory, links public skills,
and runs `suhuang doctor`.

--from-source is an explicit developer fallback for an already-cloned checkout.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --version)
      VERSION="${2:?missing version}"
      shift 2
      ;;
    --install-dir)
      INSTALL_DIR="${2:?missing install dir}"
      shift 2
      ;;
    --bin-dir)
      BIN_DIR="${2:?missing bin dir}"
      shift 2
      ;;
    --repo)
      REPO="${2:?missing OWNER/REPO}"
      shift 2
      ;;
    --from-source)
      FROM_SOURCE=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

detect_target() {
  local os arch
  os="$(uname -s)"
  arch="$(uname -m)"
  case "$os" in
    Darwin)
      if [[ "$arch" == "arm64" || "$arch" == "aarch64" ]]; then
        echo "macos-arm64"
      else
        echo "macos-x64"
      fi
      ;;
    Linux)
      if [[ "$arch" != "x86_64" && "$arch" != "amd64" ]]; then
        echo "Unsupported Linux architecture: $arch" >&2
        exit 1
      fi
      echo "linux-x64"
      ;;
    MINGW*|MSYS*|CYGWIN*)
      echo "windows-x64"
      ;;
    *)
      echo "Unsupported OS: $os" >&2
      exit 1
      ;;
  esac
}

validate_install_paths() {
  case "$INSTALL_DIR" in
    ""|"/"|"$HOME") echo "Unsafe install directory: $INSTALL_DIR" >&2; exit 2 ;;
  esac
  case "$BIN_DIR" in
    ""|"/"|"$HOME") echo "Unsafe bin directory: $BIN_DIR" >&2; exit 2 ;;
  esac
}

link_public_skills() {
  local skill target
  [[ -d "$INSTALL_DIR/skills" ]] || return 0
  mkdir -p "$SKILLS_DIR"
  for skill in "$INSTALL_DIR"/skills/*; do
    [[ -d "$skill" && -f "$skill/SKILL.md" ]] || continue
    target="$SKILLS_DIR/$(basename "$skill")"
    if [[ -L "$target" || ! -e "$target" ]]; then
      ln -sfn "$skill" "$target"
    else
      echo "Keeping existing non-symlink Skill: $target"
    fi
  done
}

sha256_check() {
  local file checksum_file
  file="$1"
  checksum_file="$2"
  if command -v shasum >/dev/null 2>&1; then
    (cd "$(dirname "$file")" && shasum -a 256 -c "$(basename "$checksum_file")")
  elif command -v sha256sum >/dev/null 2>&1; then
    (cd "$(dirname "$file")" && sha256sum -c "$(basename "$checksum_file")")
  else
    echo "No SHA256 checker found. Install shasum or sha256sum." >&2
    exit 1
  fi
}

install_from_source() {
  local root
  root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
  mkdir -p "$INSTALL_DIR/bin"
  ln -sf "$root/core/bin/suhuang" "$INSTALL_DIR/bin/suhuang"
  mkdir -p "$BIN_DIR"
  ln -sf "$INSTALL_DIR/bin/suhuang" "$BIN_DIR/suhuang"
  mkdir -p "$INSTALL_DIR/skills"
  if [[ -d "$root/skills" ]]; then
    ln -sfn "$root/skills" "$INSTALL_DIR/skills/public"
  fi
  link_public_skills
  echo "Installed source launcher to $INSTALL_DIR/bin/suhuang"
  echo "Linked command shim to $BIN_DIR/suhuang"
  if [[ ":$PATH:" != *":$BIN_DIR:"* ]]; then
    echo "Add this to PATH if needed:"
    echo "  export PATH=\"$BIN_DIR:\$PATH\""
  fi
  "$INSTALL_DIR/bin/suhuang" doctor
}

download_release() {
  if [[ -z "$REPO" ]]; then
    echo "Set --repo OWNER/REPO or SUHUANG_RELEASE_REPO before downloading releases." >&2
    exit 2
  fi

  local target version_tag version_no_v ext asset base tmp archive checksum staging package_root backup
  target="$(detect_target)"
  version_tag="$VERSION"
  if [[ "$version_tag" == "latest" ]]; then
    version_tag="$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" | sed -n 's/.*"tag_name": *"\([^"]*\)".*/\1/p' | head -n 1)"
    if [[ -z "$version_tag" ]]; then
      echo "Could not resolve latest release for $REPO." >&2
      exit 1
    fi
    version_no_v="${version_tag#v}"
    base="https://github.com/$REPO/releases/download/$version_tag"
  else
    [[ "$version_tag" == v* ]] || version_tag="v$version_tag"
    version_no_v="${version_tag#v}"
    base="https://github.com/$REPO/releases/download/$version_tag"
  fi

  if [[ "$target" == linux-* ]]; then
    ext="tar.gz"
  else
    ext="zip"
  fi
  asset="Suhuang-v${version_no_v}-${target}.${ext}"
  tmp="$(mktemp -d)"
  SUHUANG_INSTALL_TMP="$tmp"
  archive="$tmp/$asset"
  checksum="$archive.sha256"

  curl -fL "$base/$asset" -o "$archive"
  curl -fL "$base/$asset.sha256" -o "$checksum"
  sha256_check "$archive" "$checksum"

  staging="$tmp/staging"
  mkdir -p "$staging"
  if [[ "$ext" == "tar.gz" ]]; then
    tar -xzf "$archive" -C "$staging"
  else
    unzip -q "$archive" -d "$staging"
  fi
  package_root="$staging/suhuang-scroll"
  if [[ ! -x "$package_root/bin/suhuang" || ! -f "$package_root/release.json" ]]; then
    echo "Downloaded package has an invalid layout." >&2
    exit 1
  fi

  mkdir -p "$(dirname "$INSTALL_DIR")"
  backup="${INSTALL_DIR}.previous"
  rm -rf "$backup"
  if [[ -e "$INSTALL_DIR" ]]; then
    mv "$INSTALL_DIR" "$backup"
  fi
  if ! mv "$package_root" "$INSTALL_DIR"; then
    [[ -e "$backup" ]] && mv "$backup" "$INSTALL_DIR"
    exit 1
  fi
  rm -rf "$backup"

  echo "Installed Suhuang Scroll to $INSTALL_DIR"
  mkdir -p "$BIN_DIR"
  ln -sf "$INSTALL_DIR/bin/suhuang" "$BIN_DIR/suhuang"
  link_public_skills
  echo "Linked command shim to $BIN_DIR/suhuang"
  if [[ ":$PATH:" != *":$BIN_DIR:"* ]]; then
    echo "Add this to PATH if needed:"
    echo "  export PATH=\"$BIN_DIR:\$PATH\""
  fi
  "$INSTALL_DIR/bin/suhuang" doctor
}

validate_install_paths
if [[ "$FROM_SOURCE" -eq 1 ]]; then
  install_from_source
else
  download_release
fi
