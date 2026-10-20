"""Generates the squee launcher icon set: legacy PNG mipmaps (API 24-25), the 512x512 store icon,
and (by hand, kept in sync with the shapes below) res/drawable/ic_launcher_foreground.xml.

The cat pudding silhouette mirrors the in-app model: cream body, caramel glaze, two ears.
Run from the android/ directory:  python tools/make_icons.py
"""
import os

from PIL import Image, ImageDraw, ImageFilter

STAGE = (241, 233, 223, 255)
SHADOW = (206, 194, 176, 150)
CREAM = (255, 244, 228, 255)
GLAZE = (215, 161, 95, 255)
INK = (101, 89, 55, 255)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES = os.path.join(ROOT, "app", "src", "main", "res")
STORE = os.path.join(ROOT, "..", "artifacts")

# Shapes are authored in a 108x108 grid (adaptive icon space) and scaled per output.
BODY = [(30, 50), (78, 50), (72, 71), (66, 79), (42, 79), (36, 71)]
EAR_L = [(35, 52), (39, 25), (53, 47)]
EAR_R = [(55, 47), (69, 25), (73, 52)]
EAR_IN_L = [(39.5, 45), (41, 32), (48, 44)]
EAR_IN_R = [(60, 44), (67, 32), (68.5, 45)]
GLAZE_BAND = [(30, 50), (78, 50), (76.5, 59), (31.5, 59)]
EYES = [(45, 65), (63, 65)]
# Two short strokes form the cat mouth (an "w") under the eyes.
MOUTH = [((50.5, 72.2), (53.5, 74.6)), ((53.5, 74.6), (56.5, 72.2))]
NOSE = (53.5, 70.6)


def draw_cat(draw: ImageDraw.ImageDraw, scale: float, offset=(0.0, 0.0)):
    def pt(p):
        return (p[0] * scale + offset[0], p[1] * scale + offset[1])

    def poly(points, fill):
        draw.polygon([pt(p) for p in points], fill=fill)

    poly(EAR_L, CREAM)
    poly(EAR_R, CREAM)
    poly(EAR_IN_L, GLAZE)
    poly(EAR_IN_R, GLAZE)
    poly(BODY, CREAM)
    poly(GLAZE_BAND, GLAZE)
    for eye in EYES:
        x, y = pt(eye)
        draw.ellipse([x - 3 * scale, y - 3.6 * scale, x + 3 * scale, y + 3.6 * scale], fill=INK)
    for a, b in MOUTH:
        draw.line([pt(a), pt(b)], fill=INK, width=max(1, int(0.9 * scale)))
    nx, ny = pt(NOSE)
    draw.ellipse([nx - 1.3 * scale, ny - 1 * scale, nx + 1.3 * scale, ny + 1 * scale], fill=INK)


def compose(size: int, art_scale: float, plate: str = "square") -> Image.Image:
    """Draws the icon at 4x and downsamples: plate shape, art scale and shadow are parameters."""
    ss = 4
    big = Image.new("RGBA", (size * ss, size * ss), (0, 0, 0, 0))
    if plate == "square":
        mask = Image.new("L", (size * ss, size * ss), 0)
        ImageDraw.Draw(mask).rounded_rectangle(
            [0, 0, size * ss - 1, size * ss - 1], radius=int(size * ss * 0.22), fill=255,
        )
    elif plate == "circle":
        mask = Image.new("L", (size * ss, size * ss), 0)
        ImageDraw.Draw(mask).ellipse([0, 0, size * ss - 1, size * ss - 1], fill=255)
    else:
        mask = Image.new("L", (size * ss, size * ss), 255)

    canvas = Image.new("RGBA", (size * ss, size * ss), STAGE)
    scale = size * ss / 108 * art_scale
    offset = (size * ss * 0.5 - 54 * scale, size * ss * 0.5 - 53 * scale)

    shadow = Image.new("RGBA", (size * ss, size * ss), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).ellipse(
        [offset[0] + 34 * scale, offset[1] + 74 * scale,
         offset[0] + 74 * scale, offset[1] + 86 * scale],
        fill=SHADOW,
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(radius=max(1, size * ss * 0.02)))
    canvas.alpha_composite(shadow)
    draw_cat(ImageDraw.Draw(canvas), scale, offset)

    big.paste(canvas, (0, 0), mask)
    return big.resize((size, size), Image.LANCZOS)


def main():
    for bucket, size in [("mdpi", 48), ("hdpi", 72), ("xhdpi", 96), ("xxhdpi", 144), ("xxxhdpi", 192)]:
        folder = os.path.join(RES, "mipmap-" + bucket)
        os.makedirs(folder, exist_ok=True)
        compose(size, 0.86, "square").save(os.path.join(folder, "ic_launcher.png"))
        compose(size, 0.82, "circle").save(os.path.join(folder, "ic_launcher_round.png"))
        print("wrote", folder)

    os.makedirs(STORE, exist_ok=True)
    compose(512, 0.94, "flat").save(os.path.join(STORE, "store-icon-512.png"))
    print("wrote", os.path.normpath(os.path.join(STORE, "store-icon-512.png")))


if __name__ == "__main__":
    main()
