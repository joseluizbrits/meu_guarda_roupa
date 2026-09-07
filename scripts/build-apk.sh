#!/usr/bin/env bash
# Builds a release Android APK and publishes it to the downloads dir served
# at https://guardaroupa.rafaelferro.dev/downloads/.
#
# Usage:
#   scripts/build-apk.sh            # use version from app.json
#   VERSION=1.1.0 scripts/build-apk.sh   # override versioned filename
#
# Requires: JDK 17 (JAVA_HOME), Android SDK (ANDROID_HOME) with platform +
# build-tools matching the project, and node/npm deps installed in mobile/.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MOBILE="$ROOT/mobile"
ANDROID_DIR="$MOBILE/android"
DEST_DIR="$ROOT/infra/downloads"

VERSION="${VERSION:-$(grep -oP '"version":\s*"\K[^"]+' "$MOBILE/app.json" | head -1)}"
APK_NAME="meu-guarda-roupa-${VERSION}.apk"

export ANDROID_HOME="${ANDROID_HOME:-/opt/android-sdk}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"

if [ -d "$ANDROID_DIR" ]; then
  echo "[apk] native project exists, skipping prebuild"
else
  echo "[apk] running expo prebuild..."
  (cd "$MOBILE" && npx expo prebuild --platform android --no-install)
fi

echo "[apk] gradle assembleRelease (VERSION=$VERSION)..."
(cd "$ANDROID_DIR" && ./gradlew assembleRelease --no-daemon)

SRC="$ANDROID_DIR/app/build/outputs/apk/release/app-release.apk"
mkdir -p "$DEST_DIR"
cp "$SRC" "$DEST_DIR/$APK_NAME"

echo "[apk] published -> infra/downloads/$APK_NAME"
echo "[apk] served at https://guardaroupa.rafaelferro.dev/downloads/$APK_NAME"
