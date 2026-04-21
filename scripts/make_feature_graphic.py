"""Generate Google Play listing assets (feature graphic + 512x512 icon)."""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
FOREGROUND = ROOT / "assets" / "images" / "android-icon-foreground.png"
OUT = ROOT / "docs" / "play-store" / "feature-graphic.png"
ICON_OUT = ROOT / "docs" / "play-store" / "icon-512.png"

BG = (230, 244, 254)  # #E6F4FE — matches adaptiveIcon.backgroundColor
FG = (20, 40, 60)
SIZE = (1024, 500)
ICON_SIZE = 320
PAD_LEFT = 56
PAD_BETWEEN = 48
PAD_RIGHT = 56
FONT_PATH = "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf"


def fit_font(draw: ImageDraw.ImageDraw, text: str, max_width: int, start_size: int) -> ImageFont.FreeTypeFont:
    size = start_size
    while size > 12:
        font = ImageFont.truetype(FONT_PATH, size)
        bbox = draw.textbbox((0, 0), text, font=font)
        if bbox[2] - bbox[0] <= max_width:
            return font
        size -= 2
    return ImageFont.truetype(FONT_PATH, 12)


def main() -> None:
    canvas = Image.new("RGB", SIZE, BG)
    icon = Image.open(FOREGROUND).convert("RGBA").resize((ICON_SIZE, ICON_SIZE), Image.LANCZOS)
    icon_x = PAD_LEFT
    icon_y = (SIZE[1] - ICON_SIZE) // 2
    canvas.paste(icon, (icon_x, icon_y), icon)

    draw = ImageDraw.Draw(canvas)
    text_x = icon_x + ICON_SIZE + PAD_BETWEEN
    text_width = SIZE[0] - text_x - PAD_RIGHT

    title = "Voice Checklist"
    tagline = "Hands-free checklists"
    title_font = fit_font(draw, title, text_width, 88)
    tagline_font = fit_font(draw, tagline, text_width, 38)

    title_bbox = draw.textbbox((0, 0), title, font=title_font)
    tagline_bbox = draw.textbbox((0, 0), tagline, font=tagline_font)
    title_h = title_bbox[3] - title_bbox[1]
    tagline_h = tagline_bbox[3] - tagline_bbox[1]
    gap = 20
    total_h = title_h + gap + tagline_h
    title_y = (SIZE[1] - total_h) // 2 - title_bbox[1]
    tagline_y = title_y + title_h + gap + (title_bbox[1] - tagline_bbox[1])

    draw.text((text_x, title_y), title, font=title_font, fill=FG)
    draw.text((text_x, tagline_y), tagline, font=tagline_font, fill=FG)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(OUT, "PNG", optimize=True)
    print(f"wrote {OUT} ({OUT.stat().st_size} bytes, {SIZE[0]}x{SIZE[1]})")

    icon_canvas = Image.new("RGB", (512, 512), BG)
    icon = Image.open(FOREGROUND).convert("RGBA").resize((512, 512), Image.LANCZOS)
    icon_canvas.paste(icon, (0, 0), icon)
    icon_canvas.save(ICON_OUT, "PNG", optimize=True)
    print(f"wrote {ICON_OUT} ({ICON_OUT.stat().st_size} bytes, 512x512)")


if __name__ == "__main__":
    main()
