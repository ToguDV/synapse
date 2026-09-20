"""Genera resources/icon.png (1024x1024) para electron-builder.

Motivo: sinapsis (nodo central + 6 nodos periféricos conectados) sobre un
cuadrado redondeado con degradado oscuro. Ejecutar desde la raíz del repo:
    python3 resources/make-icon.py
"""
from PIL import Image, ImageDraw

SIZE = 1024
CENTER = SIZE // 2
BG_TOP = (32, 32, 32)
BG_BOTTOM = (10, 10, 10)
ACCENT = (59, 130, 246)
ACCENT_LIGHT = (147, 197, 253)
BORDER = (64, 64, 64)


def rounded_mask(size: int, radius: int) -> Image.Image:
    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=255)
    return mask


def background(size: int) -> Image.Image:
    bg = Image.new("RGB", (size, size))
    draw = ImageDraw.Draw(bg)
    for y in range(size):
        t = y / (size - 1)
        color = tuple(round(BG_TOP[i] + (BG_BOTTOM[i] - BG_TOP[i]) * t) for i in range(3))
        draw.line((0, y, size, y), fill=color)
    return bg


def main() -> None:
    canvas = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    bg = background(SIZE).convert("RGBA")
    canvas.paste(bg, (0, 0), rounded_mask(SIZE, 224))

    overlay = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    draw.rounded_rectangle((6, 6, SIZE - 7, SIZE - 7), radius=220, outline=BORDER, width=6)

    orbit = 300
    nodes = [
        (CENTER + round(orbit * 0.94), CENTER - round(orbit * 0.34)),
        (CENTER + round(orbit * 0.94), CENTER + round(orbit * 0.34)),
        (CENTER, CENTER + orbit),
        (CENTER - round(orbit * 0.94), CENTER + round(orbit * 0.34)),
        (CENTER - round(orbit * 0.94), CENTER - round(orbit * 0.34)),
        (CENTER, CENTER - orbit),
    ]
    for x, y in nodes:
        draw.line((CENTER, CENTER, x, y), fill=ACCENT, width=34)
    for x, y in nodes:
        r = 58
        draw.ellipse((x - r, y - r, x + r, y + r), fill=ACCENT, outline=(255, 255, 255, 60), width=4)

    core = 128
    draw.ellipse(
        (CENTER - core, CENTER - core, CENTER + core, CENTER + core),
        fill=ACCENT_LIGHT,
        outline=ACCENT,
        width=14,
    )
    canvas.alpha_composite(overlay)

    canvas.save("resources/icon.png")
    print("resources/icon.png", canvas.size)


if __name__ == "__main__":
    main()
