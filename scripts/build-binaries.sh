#!/usr/bin/env bash
set -euo pipefail

TARGETS=(
  "bun-darwin-arm64:darwin-arm64"
  "bun-darwin-x64:darwin-x64"
  "bun-linux-x64:linux-x64"
  "bun-linux-arm64:linux-arm64"
  "bun-windows-x64:windows-x64"
)

RELEASE_DIR="dist/release"
rm -rf "$RELEASE_DIR"
mkdir -p "$RELEASE_DIR"

for entry in "${TARGETS[@]}"; do
  target="${entry%%:*}"
  label="${entry##*:}"
  platform="${label%%-*}"
  arch="${label##*-}"

  outfile="$RELEASE_DIR/numo"

  echo "Building $label..."
  if [[ "$platform" == "windows" ]]; then
    outfile="$RELEASE_DIR/numo.exe"
    bun build dist/cli.cjs --compile --target="$target" --outfile="$outfile"
    (cd "$RELEASE_DIR" && zip "numo-${platform}-${arch}.zip" "numo.exe" && rm "numo.exe")
  else
    bun build dist/cli.cjs --compile --target="$target" --outfile="$outfile"
    (cd "$RELEASE_DIR" && tar czf "numo-${platform}-${arch}.tar.gz" "numo" && rm "numo")
  fi
done

echo "Generating checksums..."
(cd "$RELEASE_DIR" && shasum -a 256 *.tar.gz *.zip > checksums.txt)

echo "Done. Release artifacts:"
ls -lh "$RELEASE_DIR"
