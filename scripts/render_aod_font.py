from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


OUT = Path("assets/fonts/aod")
FONT = Path("assets/fonts/rostex.regular.ttf")
WIDTH = 56
HEIGHT = 78
COLOR = (141, 149, 157, 255)


def render_glyph(font, glyph, width):
    image = Image.new("RGBA", (width, HEIGHT), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    box = draw.textbbox((0, 0), glyph, font=font)
    glyph_width = box[2] - box[0]
    glyph_height = box[3] - box[1]
    x = (width - glyph_width) // 2 - box[0]
    y = (HEIGHT - glyph_height) // 2 - box[1]
    draw.text((x, y), glyph, font=font, fill=COLOR)
    return image


OUT.mkdir(parents=True, exist_ok=True)
font = ImageFont.truetype(FONT, 58)

for digit in "0123456789":
    render_glyph(font, digit, WIDTH).save(OUT / f"{digit}.png")

render_glyph(font, ":", 24).save(OUT / "colon.png")
