#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")/.."

export LC_ALL=en_US.UTF-8
export PATH="$HOME/.cargo/bin:$(brew --prefix llvm)/bin:$(brew --prefix lld)/bin:$PATH"

for tool in cargo-xwin makensis; do
  command -v "$tool" >/dev/null || { echo "Missing $tool. See the Commands section of AGENTS.md." >&2; exit 1; }
done

TARGET="${1:-x86_64-pc-windows-msvc}"

pnpm tauri build --runner cargo-xwin --target "$TARGET" --bundles nsis

ls -lh "src-tauri/target/$TARGET/release/bundle/nsis/"*-setup.exe
