#!/usr/bin/env bash
# Exports JS bundle for OTA updates (expo export) and publishes to
# infra/updates/{runtimeVersion}/{updateId}/ with a symlink to latest.
#
# Usage:
#   scripts/publish-update.sh
#
# Requires: node/npm deps installed in mobile/, jq, uuidgen.
# Runs in background with setsid to survive shell timeouts (export is slow).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MOBILE="$ROOT/mobile"
UPDATES_DIR="$ROOT/infra/updates"

export NODE_OPTIONS="--max-old-space-size=4096"

echo "[publish-js] Starting expo export (platform: android)..."

# Run export with setsid to survive timeouts
EXPORT_DIR="$MOBILE/dist"
cd "$MOBILE"
setsid npx expo export --platform android --output-dir dist > /tmp/expo-export.log 2>&1
EXPORT_EXIT=$?

if [ $EXPORT_EXIT -ne 0 ]; then
  echo "[publish-js] Export failed, check /tmp/expo-export.log"
  cat /tmp/expo-export.log
  exit $EXPORT_EXIT
fi

echo "[publish-js] Export complete"

# Get runtimeVersion from expo config
RUNTIME_JSON=$(cd "$MOBILE" && npx expo config --json)
RUNTIME_VERSION=$(echo "$RUNTIME_JSON" | jq -r '.extra?.runtimeVersion // .runtimeVersion // empty')

if [ -z "$RUNTIME_VERSION" ]; then
  echo "[publish-js] ERROR: Could not determine runtimeVersion from expo config"
  exit 1
fi

echo "[publish-js] runtimeVersion: $RUNTIME_VERSION"

# Generate updateId (UUID lowercase) and createdAt (ISO8601 Z)
UPDATE_ID=$(uuidgen | tr 'A-Z' 'a-z')
CREATED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)

TARGET_DIR="$UPDATES_DIR/$RUNTIME_VERSION/$UPDATE_ID"
LATEST_SYMLINK="$UPDATES_DIR/$RUNTIME_VERSION/latest"

echo "[publish-js] Creating update directory: $TARGET_DIR"
mkdir -p "$TARGET_DIR"

# Copy export output
cp -r "$EXPORT_DIR"/* "$TARGET_DIR"/

# Update metadata.json with our generated updateId and createdAt
METADATA_FILE="$TARGET_DIR/metadata.json"
if [ -f "$METADATA_FILE" ]; then
  # Use jq to update id and createdAt fields
  jq --arg id "$UPDATE_ID" --arg created "$CREATED_AT" '.id = $id | .createdAt = $created' "$METADATA_FILE" > "$METADATA_FILE.tmp" && mv "$METADATA_FILE.tmp" "$METADATA_FILE"
  echo "[publish-js] Updated metadata.json with id=$UPDATE_ID createdAt=$CREATED_AT"
else
  echo "[publish-js] WARNING: metadata.json not found in export output"
fi

# Update symlink
ln -sfn "$UPDATE_ID" "$LATEST_SYMLINK"
echo "[publish-js] Symlink updated: $LATEST_SYMLINK -> $UPDATE_ID"

# Print summary
echo "[publish-js] Published OTA update:"
echo "  runtimeVersion: $RUNTIME_VERSION"
echo "  updateId:       $UPDATE_ID"
echo "  createdAt:      $CREATED_AT"
echo "  path:           $TARGET_DIR"
echo "  symlink:        $LATEST_SYMLINK"
echo "  manifest URL:   https://guardaroupa.rafaelferro.dev/api/updates/manifest (expo-runtime-version: $RUNTIME_VERSION)"