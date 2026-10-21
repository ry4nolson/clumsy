#!/usr/bin/env bash
# Creates a branded DMG with the app + Applications symlink.
# Uses dmgbuild (no Finder AppleScript) so layout works headlessly in CI.
#
# Usage: ./scripts/create-dmg.sh <app-bundle-path> <output-dmg-path>
set -euo pipefail

APP_PATH="$1"
OUTPUT_DMG="$2"
APP_NAME="$(basename "$APP_PATH" .app)"
VOLUME_NAME="$APP_NAME"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SETTINGS="$SCRIPT_DIR/dmg/settings.py"
ICON="$SCRIPT_DIR/../src-tauri/icons/icon.icns"

if [[ ! -d "$APP_PATH" ]]; then
    echo "App bundle not found: $APP_PATH" >&2
    exit 1
fi
if [[ ! -f "$SETTINGS" ]]; then
    echo "DMG settings missing: $SETTINGS" >&2
    exit 1
fi

hdiutil detach "/Volumes/$VOLUME_NAME" -force 2>/dev/null || true
rm -f "$OUTPUT_DMG"

run_dmgbuild() {
    export CLUMSY_DMG_APP="$(cd "$(dirname "$APP_PATH")" && pwd)/$(basename "$APP_PATH")"
    export CLUMSY_DMG_BACKGROUND="$(cd "$SCRIPT_DIR/dmg" && pwd)/background.png"
    export CLUMSY_DMG_ICON=""
    if [[ -f "$ICON" ]]; then
        CLUMSY_DMG_ICON="$(cd "$(dirname "$ICON")" && pwd)/$(basename "$ICON")"
        export CLUMSY_DMG_ICON
    fi
    if [[ ! -f "$CLUMSY_DMG_BACKGROUND" ]]; then
        echo "DMG background missing: $CLUMSY_DMG_BACKGROUND" >&2
        return 1
    fi

    if command -v uvx >/dev/null 2>&1; then
        uvx --from dmgbuild dmgbuild -s "$SETTINGS" "$VOLUME_NAME" "$OUTPUT_DMG"
        return
    fi
    if command -v dmgbuild >/dev/null 2>&1; then
        dmgbuild -s "$SETTINGS" "$VOLUME_NAME" "$OUTPUT_DMG"
        return
    fi

    # CI / machines without uv: install for the system Python (has SSL).
    local py="${DMGBUILD_PYTHON:-/usr/bin/python3}"
    if [[ ! -x "$py" ]]; then
        py="$(command -v python3)"
    fi
    echo "==> Installing dmgbuild for $py..."
    "$py" -m pip install --user --quiet dmgbuild
    "$py" -m dmgbuild -s "$SETTINGS" "$VOLUME_NAME" "$OUTPUT_DMG"
}

echo "==> Creating branded disk image..."
# CI runners occasionally return "Resource busy" from disk arbitration; retry.
for attempt in 1 2 3 4 5; do
    if run_dmgbuild; then
        echo "✓ Created $OUTPUT_DMG"
        exit 0
    fi
    echo "DMG create failed (attempt $attempt); retrying..." >&2
    hdiutil detach "/Volumes/$VOLUME_NAME" -force 2>/dev/null || true
    rm -f "$OUTPUT_DMG"
    sleep $((attempt * 2))
done

echo "dmgbuild failed after retries" >&2
exit 1
