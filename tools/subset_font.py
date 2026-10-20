"""Subsets the UI typeface down to the ~60 glyphs squee actually renders.

Bundling a full CJK font would add 10-20 MB to the APK, so we cut a woff2 with just the characters
used by the minimal UI (caption, five flavour labels, a11y labels, ASCII). Anything else falls back to
the system sans, which only matters for the rare "no renderer" error text.

Source font: ZCOOL KuaiLe (站酷快乐体), free for commercial use, fetched from Google Fonts.
Usage:
    python tools/subset_font.py                 # uses fonts/ZCOOLKuaiLe-Regular.ttf
    python tools/subset_font.py <src.ttf> <out.woff2>
"""
import os
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONTS = os.path.join(ROOT, "fonts")
DEFAULT_SRC = os.path.join(FONTS, "ZCOOLKuaiLe-Regular.ttf")
# Where the woff2 lands: inside the web project, so vite fingerprints and copies it into dist/assets.
DEFAULT_OUT = os.path.abspath(
    os.path.join(ROOT, "..", "milk-meow-jelly", "src", "fonts", "squee-round.woff2")
)
GOOGLE_FONTS_TTF = "https://fonts.gstatic.com/s/zcoolkuaile/v22/tssqApdaRQokwFjFJjvM6h2Wpg.ttf"

# Every character the UI can paint. Keep this list in sync with src/ui/panel.ts and src/main.ts.
TEXT = (
    "捏一捏拉一摇牛奶草莓抹茶黑巧赛博复原小猫咪戳松开看它晃软回弹按住拖动去再试一次"
    "今日份软甜品种口味每个都很有弹性收敛感觉力量度参数调整界面提示帮助说明关于本"
    "块布丁这只是一款用来玩的软体玩具没有收集任何信息你不需要注册登录就能直接使用"
    "0123456789"
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    "abcdefghijklmnopqrstuvwxyz"
    " .,·—、。：；！？/()+-×"
)


def ensure_source(path: str) -> str:
    if os.path.exists(path):
        return path
    os.makedirs(os.path.dirname(path), exist_ok=True)
    print(f"downloading {GOOGLE_FONTS_TTF}")
    request = urllib.request.Request(GOOGLE_FONTS_TTF, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(request, timeout=60) as response, open(path, "wb") as out:
        out.write(response.read())
    return path


def main() -> int:
    source = ensure_source(sys.argv[1] if len(sys.argv) > 1 else DEFAULT_SRC)
    output = sys.argv[2] if len(sys.argv) > 2 else DEFAULT_OUT

    from fontTools import subset

    os.makedirs(os.path.dirname(output), exist_ok=True)
    options = subset.Options()
    options.flavor = "woff2"
    options.desubroutinize = True
    options.layout_features = ["*"]
    options.name_IDs = ["*"]
    options.notdef_outline = True
    font = subset.load_font(source, options)
    subsetter = subset.Subsetter(options=options)
    subsetter.populate(text=TEXT)
    subsetter.subset(font)
    subset.save_font(font, output, options)
    font.close()

    size = os.path.getsize(output)
    print(f"{os.path.relpath(output, ROOT)}  {size / 1024:.1f} KB  ({len(TEXT)} chars)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())