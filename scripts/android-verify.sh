#!/usr/bin/env bash
# Helper for running the freshly-built APK on the connected Pixel and capturing
# screenshots for the requirements walk-through.
set -euo pipefail

export ADB_SERVER_SOCKET="${ADB_SERVER_SOCKET:-tcp:host.docker.internal:5037}"

PKG="com.mbuchoff.voicechecklist"
APK="android/app/build/outputs/apk/release/app-release.apk"
SHOTS_DIR="verification/android"

mkdir -p "$SHOTS_DIR"

shot() {
  local name="$1"
  adb exec-out screencap -p > "$SHOTS_DIR/$name.png"
  echo "saved $SHOTS_DIR/$name.png"
}

case "${1:-help}" in
  install)
    adb install -r -t "$APK"
    ;;
  launch)
    adb shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1 >/dev/null
    sleep 2
    ;;
  shot)
    shot "${2:-shot}"
    ;;
  uninstall)
    adb uninstall "$PKG" || true
    ;;
  permissions:reset)
    adb shell pm clear "$PKG" || true
    ;;
  permissions:revoke)
    adb shell pm revoke "$PKG" android.permission.RECORD_AUDIO || true
    ;;
  permissions:grant)
    adb shell pm grant "$PKG" android.permission.RECORD_AUDIO || true
    ;;
  *)
    echo "usage: $0 {install|launch|shot <name>|uninstall|permissions:reset|permissions:revoke|permissions:grant}"
    ;;
esac
