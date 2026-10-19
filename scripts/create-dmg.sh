#!/usr/bin/env bash
# Creates a simple DMG with the app + Applications symlink.
# No Finder styling / AppleScript — works headlessly in CI.
#
# Usage: ./scripts/create-dmg.sh <app-bundle-path> <output-dmg-path>
set -euo pipefail

APP_PATH="$1"
OUTPUT_DMG="$2"
APP_NAME="$(basename "$APP_PATH" .app)"
VOLUME_NAME="$APP_NAME"
WORK_DIR="$(dirname "$OUTPUT_DMG")"
STAGING="$WORK_DIR/dmg-staging"

if [[ ! -d "$APP_PATH" ]]; then
    echo "App bundle not found: $APP_PATH" >&2
    exit 1
fi

hdiutil detach "/Volumes/$VOLUME_NAME" -force 2>/dev/null || true
rm -rf "$STAGING" "$OUTPUT_DMG"

echo "==> Staging DMG contents..."
mkdir -p "$STAGING"
ditto "$APP_PATH" "$STAGING/$APP_NAME.app"
ln -s /Applications "$STAGING/Applications"

echo "==> Creating disk image..."
hdiutil create \
    -srcfolder "$STAGING" \
    -volname "$VOLUME_NAME" \
    -fs HFS+ \
    -format UDZO \
    -imagekey zlib-level=9 \
    -ov \
    "$OUTPUT_DMG"

rm -rf "$STAGING"
echo "✓ Created $OUTPUT_DMG"
