#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")/.."

command -v docker >/dev/null || { echo "Missing docker. See the Commands section of AGENTS.md." >&2; exit 1; }

IMAGE=clumsy-linux-build
OUT=src-tauri/target/linux

docker build -q -t "$IMAGE" scripts/linux >/dev/null

run() {
  docker run --rm \
    -v "$PWD":/work \
    -v clumsy-linux-modules:/work/node_modules \
    -v clumsy-linux-target:/target \
    -v clumsy-linux-cargo:/opt/cargo/registry \
    -v clumsy-linux-pnpm:/root/.local/share/pnpm \
    "$IMAGE" bash -euo pipefail -c "$1"
}

if [ $# -gt 0 ]; then
  run "pnpm install --frozen-lockfile >/dev/null && $*"
  exit
fi

run "pnpm install --frozen-lockfile && pnpm tauri build --bundles deb,rpm,appimage && rm -rf $OUT && mkdir -p $OUT && cp /target/release/bundle/deb/*.deb /target/release/bundle/rpm/*.rpm /target/release/bundle/appimage/*.AppImage $OUT/"

ls -lh "$OUT"
