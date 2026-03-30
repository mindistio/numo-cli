#!/bin/sh
# Numo CLI installer
# Usage: curl -fsSL https://raw.githubusercontent.com/mindistio/numo-cli/main/install.sh | bash

set -e

INSTALL_DIR="${NUMO_INSTALL:-$HOME/.numo/bin}"
REPO="mindistio/numo-cli"

main() {
  need_cmd curl
  need_cmd tar

  local arch
  local os

  os="$(uname -s)"
  arch="$(uname -m)"

  case "$os" in
    Darwin) os="darwin" ;;
    Linux)  os="linux" ;;
    *)
      err "Unsupported OS: $os"
      ;;
  esac

  case "$arch" in
    x86_64|amd64) arch="x64" ;;
    arm64|aarch64) arch="arm64" ;;
    *)
      err "Unsupported architecture: $arch"
      ;;
  esac

  local version
  if [ -n "$1" ]; then
    version="$1"
  else
    version="$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" | grep '"tag_name"' | sed -E 's/.*"([^"]+)".*/\1/')"
  fi

  if [ -z "$version" ]; then
    err "Could not determine latest version"
  fi

  local filename="numo-${os}-${arch}.tar.gz"
  local base_url="https://github.com/${REPO}/releases/download/${version}"

  echo "Installing Numo CLI ${version} (${os}/${arch})..."

  mkdir -p "$INSTALL_DIR"

  local tmpdir
  tmpdir="$(mktemp -d)"
  trap 'rm -rf "$tmpdir"' EXIT

  curl -fsSL -o "$tmpdir/$filename" "$base_url/$filename"
  curl -fsSL -o "$tmpdir/checksums.txt" "$base_url/checksums.txt"

  local expected
  expected="$(grep "$filename" "$tmpdir/checksums.txt" | awk '{print $1}')"
  if [ -z "$expected" ]; then
    err "Checksum not found for $filename"
  fi

  local actual
  actual="$(shasum -a 256 "$tmpdir/$filename" | awk '{print $1}')"
  if [ "$expected" != "$actual" ]; then
    err "Checksum mismatch: expected $expected, got $actual"
  fi

  tar -xz -C "$INSTALL_DIR" -f "$tmpdir/$filename"
  chmod +x "$INSTALL_DIR/numo"

  # Remove macOS quarantine flag
  if [ "$os" = "darwin" ]; then
    xattr -d com.apple.quarantine "$INSTALL_DIR/numo" 2>/dev/null || true
  fi

  add_to_path

  echo ""
  echo "Numo CLI installed to $INSTALL_DIR/numo"
  echo ""
  echo "Get started:"
  echo "  numo login"
  echo "  numo tasks list --date \$(date +%Y-%m-%d)"
}

add_to_path() {
  local path_entry="export PATH=\"$INSTALL_DIR:\$PATH\""

  case "$(basename "$SHELL")" in
    zsh)
      local rc="$HOME/.zshrc"
      if ! grep -q "$INSTALL_DIR" "$rc" 2>/dev/null; then
        echo "" >> "$rc"
        echo "# Numo CLI" >> "$rc"
        echo "$path_entry" >> "$rc"
        echo "Added $INSTALL_DIR to PATH in $rc"
      fi
      ;;
    bash)
      local rc="$HOME/.bashrc"
      if ! grep -q "$INSTALL_DIR" "$rc" 2>/dev/null; then
        echo "" >> "$rc"
        echo "# Numo CLI" >> "$rc"
        echo "$path_entry" >> "$rc"
        echo "Added $INSTALL_DIR to PATH in $rc"
      fi
      ;;
    fish)
      local rc="$HOME/.config/fish/config.fish"
      if ! grep -q "$INSTALL_DIR" "$rc" 2>/dev/null; then
        mkdir -p "$(dirname "$rc")"
        echo "" >> "$rc"
        echo "# Numo CLI" >> "$rc"
        echo "set -gx PATH $INSTALL_DIR \$PATH" >> "$rc"
        echo "Added $INSTALL_DIR to PATH in $rc"
      fi
      ;;
    *)
      echo "Add $INSTALL_DIR to your PATH manually."
      ;;
  esac
}

need_cmd() {
  if ! command -v "$1" > /dev/null 2>&1; then
    err "Required command not found: $1"
  fi
}

err() {
  echo "Error: $1" >&2
  exit 1
}

main "$@"
