#!/usr/bin/env bash
# Creates a branded DMG with the app + Applications symlink.
# Uses Homebrew create-dmg so Finder itself writes the background alias
# (dmgbuild's DS_Store layout sticks, but its background picture often does not
# on modern macOS).
#
# Usage: ./scripts/create-dmg.sh <app-bundle-path> <output-dmg-path>
# Requires: brew install create-dmg
set -euo pipefail

APP_PATH="$1"
OUTPUT_DMG="$2"
APP_NAME="$(basename "$APP_PATH" .app)"
VOLUME_NAME="$APP_NAME"
WORK_DIR="$(cd "$(dirname "$OUTPUT_DMG")" && pwd)"
OUTPUT_DMG="$WORK_DIR/$(basename "$OUTPUT_DMG")"
STAGING="$WORK_DIR/dmg-staging"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKGROUND="$SCRIPT_DIR/dmg/background.png"
ICON="$SCRIPT_DIR/../src-tauri/icons/icon.icns"

if [[ ! -d "$APP_PATH" ]]; then
    echo "App bundle not found: $APP_PATH" >&2
    exit 1
fi
if [[ ! -f "$BACKGROUND" ]]; then
    echo "DMG background missing: $BACKGROUND" >&2
    exit 1
fi
if ! command -v create-dmg >/dev/null 2>&1; then
    echo "create-dmg not found. Install with: brew install create-dmg" >&2
    exit 1
fi

hdiutil detach "/Volumes/$VOLUME_NAME" -force 2>/dev/null || true
rm -rf "$STAGING" "$OUTPUT_DMG"

echo "==> Staging DMG contents..."
mkdir -p "$STAGING"
ditto "$APP_PATH" "$STAGING/$APP_NAME.app"

echo "==> Creating branded disk image..."
# Finder AppleScript can time out under load; retry the whole create.
for attempt in 1 2 3 4 5; do
    hdiutil detach "/Volumes/$VOLUME_NAME" -force 2>/dev/null || true
    # create-dmg leaves a volume named after a temp RW image if AppleScript fails mid-run
    shopt -s nullglob
    for vol in /Volumes/dmg.*; do
        hdiutil detach "$vol" -force 2>/dev/null || true
    done
    shopt -u nullglob
    rm -f "$OUTPUT_DMG"

    args=(
        --volname "$VOLUME_NAME"
        --background "$BACKGROUND"
        --window-pos 200 120
        --window-size 660 420
        --icon-size 128
        --text-size 12
        --icon "$APP_NAME.app" 160 175
        --hide-extension "$APP_NAME.app"
        --app-drop-link 500 175
        --hdiutil-quiet
        --hdiutil-retries 5
    )
    if [[ -f "$ICON" ]]; then
        args+=(--volicon "$ICON")
    fi

    if create-dmg "${args[@]}" "$OUTPUT_DMG" "$STAGING"; then
        rm -rf "$STAGING"
        echo "✓ Created $OUTPUT_DMG"
        exit 0
    fi
    echo "create-dmg failed (attempt $attempt); retrying..." >&2
    sleep $((attempt * 2))
done

rm -rf "$STAGING"
echo "create-dmg failed after retries" >&2
exit 1
