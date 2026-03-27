"""Generate iOS App Store icon set from the DBC brand.

Produces a 1024x1024 master icon and all sizes required by Xcode's
AppIcon asset catalog.  Run once; commit the PNGs.
"""

from PIL import Image, ImageDraw, ImageFont
import os

SIZES = [
    (20, 1), (20, 2), (20, 3),
    (29, 1), (29, 2), (29, 3),
    (40, 1), (40, 2), (40, 3),
    (60, 2), (60, 3),
    (76, 1), (76, 2),
    (83.5, 2),
    (1024, 1),
]

BG_COLOR = (10, 10, 10)
DOLLAR_COLOR = (53, 208, 111)

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "apps", "member", "public", "icons")


def rounded_rect_mask(size, radius):
    mask = Image.new("L", size, 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle([(0, 0), (size[0] - 1, size[1] - 1)], radius=radius, fill=255)
    return mask


def draw_icon(px):
    """Create a single icon at the given pixel dimension."""
    img = Image.new("RGB", (px, px), BG_COLOR)
    draw = ImageDraw.Draw(img)

    corner_radius = int(px * 0.22)
    draw.rounded_rectangle(
        [(0, 0), (px - 1, px - 1)],
        radius=corner_radius,
        fill=BG_COLOR,
    )

    font_size = int(px * 0.74)
    try:
        font = ImageFont.truetype("arial.ttf", font_size)
    except OSError:
        try:
            font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", font_size)
        except OSError:
            font = ImageFont.load_default()

    bbox = draw.textbbox((0, 0), "$", font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    x = (px - tw) / 2 - bbox[0]
    y = (px - th) / 2 - bbox[1]
    draw.text((x, y), "$", fill=DOLLAR_COLOR, font=font)

    return img


def main():
    os.makedirs(OUT_DIR, exist_ok=True)

    master = draw_icon(1024)
    master.save(os.path.join(OUT_DIR, "icon-1024.png"), "PNG")
    print("  icon-1024.png")

    seen = set()
    for base, scale in SIZES:
        px = int(base * scale)
        if px in seen:
            continue
        seen.add(px)
        name = f"icon-{px}.png"
        if px == 1024:
            continue
        resized = master.resize((px, px), Image.LANCZOS)
        resized.save(os.path.join(OUT_DIR, name), "PNG")
        print(f"  {name}")

    web_192 = master.resize((192, 192), Image.LANCZOS)
    web_192.save(os.path.join(OUT_DIR, "icon-192.png"), "PNG")
    print("  icon-192.png (PWA)")

    web_512 = master.resize((512, 512), Image.LANCZOS)
    web_512.save(os.path.join(OUT_DIR, "icon-512.png"), "PNG")
    print("  icon-512.png (PWA)")

    print(f"\nDone — icons saved to {os.path.abspath(OUT_DIR)}")


if __name__ == "__main__":
    main()
