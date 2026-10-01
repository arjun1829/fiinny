#!/usr/bin/env python3
"""Turn the supplied brand artwork into the two sources flutter_launcher_icons needs.

Run after replacing assets/icons/app_icon_source.png:

    python3 tool/prepare_icons.py
    dart run flutter_launcher_icons
    dart run flutter_native_splash:create

Why this exists rather than pointing the generator straight at the artwork:

* The artwork is a rounded card floating on a near-white page, with a soft drop
  shadow around it. Android and iOS both apply their own mask, so feeding them
  that image would round an already-rounded card (a visible double edge) and
  keep the shadow as a grey halo baked into every launcher icon. This finds the
  card and crops to its interior, so the platform mask is the only rounding.
* iOS rejects transparency in an app icon, so the result is flattened to RGB.
* An Android adaptive icon can be cropped to any shape and only the centre ~66%
  is guaranteed visible. The inset that keeps the artwork inside that safe zone
  is applied by flutter_launcher_icons (adaptive_icon_foreground_inset), so the
  foreground written here is full-bleed — insetting in both places would
  compound and leave the icon floating small inside its mask.
"""

from pathlib import Path
import sys

from PIL import Image

ICONS = Path(__file__).resolve().parent.parent / "assets" / "icons"
SOURCE = ICONS / "app_icon_source.png"
SQUARE = ICONS / "app_icon.png"
FOREGROUND = ICONS / "app_icon_foreground.png"

SIZE = 1024

# The adaptive foreground is written FULL-BLEED. flutter_launcher_icons applies
# its own `adaptive_icon_foreground_inset` (see flutter_launcher_icons.yaml),
# which is what pulls the artwork inside the ~66% safe zone. Insetting here as
# well would compound the two and leave the icon floating small in its circle.

# A pixel this much darker than the page is part of the shadow ring rather than
# the page or the card, both of which are essentially white here.
SHADOW_LUMA = 245

# Extra pixels trimmed past the detected card edge. The shadow fades gradually,
# so stopping exactly at the threshold can still leave a faint grey line.
SAFETY_TRIM = 8


def _luma(px: tuple[int, ...]) -> int:
    return (px[0] + px[1] + px[2]) // 3


def find_card_box(im: Image.Image) -> tuple[int, int, int, int]:
    """Bounding box of the card's interior, excluding its shadow and rounding.

    Walks inward along the centre row and centre column. The first run of
    shadow-dark pixels marks the card's edge; everything past it is card. Both
    the page outside and the card inside are near-white, so the shadow dip is
    the only reliable signal — a plain "not white" test would stop at the very
    first pixel and find nothing.
    """
    w, h = im.size
    px = im.load()
    cx, cy = w // 2, h // 2

    def scan(get, length: int) -> tuple[int, int]:
        lo, hi = 0, length - 1
        for i in range(length // 2):
            if _luma(get(i)) < SHADOW_LUMA:
                lo = i
                break
        for i in range(length - 1, length // 2, -1):
            if _luma(get(i)) < SHADOW_LUMA:
                hi = i
                break
        return lo, hi

    left, right = scan(lambda x: px[x, cy], w)
    top, bottom = scan(lambda y: px[cx, y], h)

    # Walk past the shadow band into the card itself.
    while left < cx and _luma(px[left, cy]) < SHADOW_LUMA:
        left += 1
    while right > cx and _luma(px[right, cy]) < SHADOW_LUMA:
        right -= 1
    while top < cy and _luma(px[cx, top]) < SHADOW_LUMA:
        top += 1
    while bottom > cy and _luma(px[cx, bottom]) < SHADOW_LUMA:
        bottom -= 1

    left += SAFETY_TRIM
    top += SAFETY_TRIM
    right -= SAFETY_TRIM
    bottom -= SAFETY_TRIM

    # Square it off around the centre so nothing is stretched.
    side = min(right - left, bottom - top)
    ccx, ccy = (left + right) // 2, (top + bottom) // 2
    half = side // 2
    return (ccx - half, ccy - half, ccx + half, ccy + half)


def main() -> int:
    if not SOURCE.exists():
        print(f"error: put the artwork at {SOURCE}", file=sys.stderr)
        return 1

    art = Image.open(SOURCE).convert("RGB")
    box = find_card_box(art)
    card = art.crop(box).resize((SIZE, SIZE), Image.LANCZOS)

    # Full-bleed square for iOS and the legacy Android icon.
    card.save(SQUARE)

    # Adaptive foreground: the same content, full-bleed. The inset is applied
    # by flutter_launcher_icons, not here.
    card.convert("RGBA").save(FOREGROUND)

    corner = card.getpixel((4, 4))
    print(f"source          {art.size[0]}x{art.size[1]}")
    print(f"card detected   {box}  ({box[2] - box[0]}px square)")
    print(f"card corner     #{'%02X%02X%02X' % corner}")
    print(f"wrote           {SQUARE.name}  {SIZE}x{SIZE}")
    print(f"wrote           {FOREGROUND.name}  {SIZE}x{SIZE} (full-bleed; inset applied by flutter_launcher_icons)")
    print()
    print("Set adaptive_icon_background in flutter_launcher_icons.yaml to the")
    print("card corner colour above if it is not already.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
