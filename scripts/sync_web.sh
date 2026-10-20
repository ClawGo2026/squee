#!/usr/bin/env bash
# Rebuilds the bundled web app and syncs it into the Android assets.
# Usage: scripts/sync_web.sh [path-to-milk-meow-jelly]
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
web="${1:-$here/../milk-meow-jelly}"
dest="$here/android/app/src/main/assets/dist"

[ -f "$web/package.json" ] || { echo "web project not found: $web" >&2; exit 1; }

echo "==> subsetting the UI typeface (needs network once)"
python "$here/tools/subset_font.py" || echo "   (font subset skipped — the app falls back to the system face)"

echo "==> installing deps in $web"
(cd "$web" && npm install)
# 诊断用的临时改动曾经溜进发布包（猫脸贴图被整层去掉），这里做一道硬闸。
if grep -rnE 'TEMP ?DIAG|XXX|FIXME' "$web/src" ; then
  echo "" >&2
  echo "!!! 构建中止：src/ 里还留着临时诊断标记（见上面行号）。" >&2
  echo "!!! 请先清理掉再打包，否则会带着调试状态出包。" >&2
  exit 1
fi

echo "==> typecheck + tests"
(cd "$web" && npm run typecheck && npm test)
echo "==> production build"
(cd "$web" && npm run build)

echo "==> syncing $web/dist -> $dest"
rm -rf "$dest"
mkdir -p "$dest"
cp -r "$web/dist/." "$dest/"

# MIT attribution travels with the binary distribution.
cp "$web/LICENSE" "$dest/LICENSE"
cp "$web/docs/upstream-readme.md" "$dest/UPSTREAM-README.md"
cp "$here/NOTICE.md" "$dest/NOTICE.md"

echo "==> done:"
du -sh "$dest"
find "$dest" -type f | sed "s|$dest/||" | sort
