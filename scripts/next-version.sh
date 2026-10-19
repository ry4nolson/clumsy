#!/usr/bin/env bash
# Prints the next release version.
# Bumps the patch of the latest vX.Y.Z tag, unless tauri.conf.json declares a
# higher version (edit it to jump to a new minor or major release).
set -euo pipefail

CONFIG_VERSION="$(node -p "require('./src-tauri/tauri.conf.json').version")"
LATEST_TAG="$(git tag --list 'v[0-9]*.[0-9]*.[0-9]*' --sort=-v:refname | head -n 1)"
LATEST="${LATEST_TAG#v}"

if [[ -z "$LATEST" ]]; then
    echo "$CONFIG_VERSION"
    exit 0
fi

HIGHEST="$(printf '%s\n%s\n' "$CONFIG_VERSION" "$LATEST" | sort -V | tail -n 1)"
if [[ "$HIGHEST" == "$CONFIG_VERSION" && "$CONFIG_VERSION" != "$LATEST" ]]; then
    echo "$CONFIG_VERSION"
else
    IFS=. read -r MAJOR MINOR PATCH <<< "$LATEST"
    echo "$MAJOR.$MINOR.$((PATCH + 1))"
fi
