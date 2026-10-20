"""Builds the Play feature graphic (1024x500).

The hero shot is the real cat, cut out of a store screenshot so the cream stage blends seamlessly
into the graphic background. Rerun it after retaking the screenshots:

    python tools/make_store_assets.py
"""
import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ARTIFACTS = os.path.abspath(os.path.join(ROOT, "..", "artifacts"))
HERO = os.path.join(ROOT, "..", "store", "screenshots", "05-cyber.png")
INK = (61, 70, 63)
ACCENT = (163, 106, 63)
FONT_CJK = r"C:\Windows\Fonts\msyhbd.ttc"      # 微软雅黑 Bold
FONT_CJK_LIGHT = r"C:\Windows\Fonts\msyh.ttc"


def font(path: str, size: int):
    return ImageFont.truetype(path, size)


def cut_cat(src: Image.Image):
    """Returns (square cat crop, stage colour). The crop's background is flattened to the stage
    colour so pasting it onto a canvas of the same colour leaves no visible seam."""
    import numpy as np
    rgb = src.convert("RGB")
    a = np.asarray(rgb).astype(int)
    stage = np.array(rgb.getpixel((6, 6)))         # 底色从截图本身取，别写死
    # 猫 = 明显比舞台暗，或明显有颜色（英雄图固定用赛博，紫得很暗，这两条足够干净）
    mask = (a.sum(axis=2) < stage.sum() - 120) | ((a.max(axis=2) - a.min(axis=2)) > 60)
    mask[:, :60] = False                             # 屏幕左右边缘的高光/暗角
    mask[:, -60:] = False

    # 裁掉顶部文案
    mask[:860, :] = False
    # 裁掉底部色板：它是一整条近白的横条，自上而下第一行长白条就是它的上沿。
    white = a.min(axis=2) > 240
    for row in range(int(a.shape[0] * .5), a.shape[0]):
        run = best = 0
        for v in white[row]:
            run = run + 1 if v else 0
            best = max(best, run)
        if best > 500:
            mask[row:, :] = False
            break

    ys, xs = np.where(mask)
    if not len(xs):
        return None, tuple(int(v) for v in stage)
    cx, cy = (xs.min() + xs.max()) // 2, (ys.min() + ys.max()) // 2
    half = max(xs.max() - xs.min(), ys.max() - ys.min()) // 2 + 18
    left, top = max(0, cx - half), max(0, cy - half)
    right, bottom = min(src.width, left + half * 2), min(src.height, top + half * 2)
    cat = Image.fromarray(a[top:bottom, left:right].astype("uint8")).resize((330, 330), Image.LANCZOS)

    # 3D 舞台带一点渐晕，直接贴会露出一块方形色差。把裁剪块里接近底色的像素统一刷成同一个
    # 颜色（猫本身是深紫，不会被误伤），再贴到同色背景上，接缝就消失了。
    arr = np.asarray(cat).astype(int)
    near = np.abs(arr - stage).sum(axis=2) < 42
    arr[near] = stage

    # 再把四周一圈羽化掉：舞台本身带渐晕和接触阴影，抠得再干净也会在方块边界留下一道色差，
    # 让边缘 12px 渐隐到背景色，边界就彻底看不见了（猫离边还有 18px 余量，不受影响）。
    n = arr.shape[0]
    ramp = np.clip(np.minimum(np.arange(n), n - 1 - np.arange(n)) / 12.0, 0, 1)
    alpha = (ramp[:, None] * ramp[None, :]) * 255
    out = np.dstack([arr.astype("uint8"), alpha.astype("uint8")])
    return Image.fromarray(out, "RGBA"), tuple(int(v) for v in stage)


def feature_graphic() -> Image.Image:
    W, H = 1024, 500
    background = (241, 233, 223)
    cat = None
    if os.path.exists(HERO):
        cat, background = cut_cat(Image.open(HERO))
    else:
        print("warning: no hero shot at", HERO)
    im = Image.new("RGB", (W, H), background)
    if cat is not None:
        im.paste(cat, (60, 85), cat)          # 用自身透明度羽化边缘
    draw = ImageDraw.Draw(im)
    x = 440
    draw.text((x, 176), "squee", font=font(FONT_CJK, 92), fill=INK)
    draw.text((x + 4, 286), "猫咪牛奶布丁", font=font(FONT_CJK_LIGHT, 46), fill=INK)
    draw.text((x + 6, 350), "捏一捏 · 拉一拉 · 摇一摇", font=font(FONT_CJK_LIGHT, 30), fill=ACCENT)
    return im


def main():
    os.makedirs(ARTIFACTS, exist_ok=True)
    path = os.path.join(ARTIFACTS, "feature-graphic-1024x500.png")
    feature_graphic().save(path)
    print("wrote", path)


if __name__ == "__main__":
    main()