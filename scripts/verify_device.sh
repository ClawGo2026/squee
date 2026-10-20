#!/usr/bin/env bash
# Installs the debug build on a connected device/emulator, launches it and reports the
# render backend the page actually got. This is the M0 compatibility probe.
#
# Usage: scripts/verify_device.sh [serial]
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
android="$here/android"
apk="$android/app/build/outputs/apk/debug/app-debug.apk"
serial="${1:-}"
sdk="${ANDROID_SDK_ROOT:-/e/Android/SDK}"
adb="$sdk/platform-tools/adb.exe"
[ -x "$adb" ] || adb=adb

adb_args=()
[ -n "$serial" ] && adb_args+=(-s "$serial")

[ -f "$apk" ] || { echo "missing $apk — run ./gradlew :app:assembleDebug first" >&2; exit 1; }

echo "==> installing"
"${adb[@]}" install -r -g "$apk" | tail -2

echo "==> clearing logcat and launching"
"${adb[@]}" logcat -c
"${adb[@]}" shell am force-stop me.copycat.squee.debug
"${adb[@]}" shell am start -W -n me.copycat.squee.debug/me.copycat.squee.MainActivity | tail -5

echo "==> waiting for the page to boot (up to 30s)"
for i in $(seq 1 30); do
  if "${adb[@]}" logcat -d | grep -q "PROBE"; then break; fi
  sleep 1
done

echo "==> capability probe"
"${adb[@]}" logcat -d -s squee | grep -E "PROBE|chromium|Console" | tail -20 || echo "(no PROBE lines — page may not have finished loading)"

echo "==> console output from the page"
"${adb[@]}" logcat -d | grep -E "squee: page:" | tail -20 || true

echo "==> screenshot"
out="$here/artifacts/device-$(date +%Y%m%d-%H%M%S).png"
mkdir -p "$here/artifacts"
"${adb[@]}" exec-out screencap -p > "$out"
echo "wrote $out"
