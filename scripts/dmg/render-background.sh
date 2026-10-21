#!/usr/bin/env bash
# Regenerates background.png (requires ImageMagick). The committed PNG is what
# create-dmg.sh uses; re-run after design tweaks.
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
OUT="$DIR/background.png"
FONT="${DMG_FONT:-/Library/Fonts/Arial Unicode.ttf}"

# One full-frame radial — avoid layered/rotated gradients (they left a vertical seam).
magick -size 660x400 \
  \( -size 660x400 radial-gradient:'#4a2838'-'#14161a' \) \
  \( -size 120x40 xc:none \
     -fill '#ffb04a' -draw 'roundrectangle 0,10 80,30 10,10' \
     -fill '#ff7a4d' -draw 'polygon 72,0 118,20 72,40' \
  \) -geometry +270+155 -compose Over -composite \
  -font "$FONT" \
  -gravity South -pointsize 20 -fill '#f2f2f5' \
  -annotate +0+82 'Drag Clumsy to Applications' \
  -pointsize 13 -fill '#a0a0ad' \
  -annotate +0+52 'No tricks, no acrobatics.' \
  PNG32:"$OUT"

echo "✓ Wrote $OUT"
