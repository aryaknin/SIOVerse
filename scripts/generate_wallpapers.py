"""Generate selected, self-hosted animated SIO OS wallpapers."""

from __future__ import annotations

import math
import random
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter


WIDTH, HEIGHT = 720, 405
FRAMES = 24
OUTPUT = Path(__file__).resolve().parent.parent / "public" / "wallpapers"
RNG = random.Random(2026)
STARS = [(RNG.randrange(WIDTH), RNG.randrange(HEIGHT), RNG.choice((1, 1, 2))) for _ in range(90)]
RAIN = [(RNG.randrange(WIDTH), RNG.randrange(HEIGHT), RNG.randrange(8, 24)) for _ in range(80)]
BUILDINGS = [(x, RNG.randrange(145, 295), RNG.randrange(20, 49)) for x in range(0, WIDTH + 30, 26)]


def gradient(top: tuple[int, int, int], bottom: tuple[int, int, int]) -> Image.Image:
    image = Image.new("RGB", (WIDTH, HEIGHT))
    draw = ImageDraw.Draw(image)
    for y in range(HEIGHT):
        t = y / (HEIGHT - 1)
        color = tuple(round(a * (1 - t) + b * t) for a, b in zip(top, bottom))
        draw.line((0, y, WIDTH, y), fill=color)
    return image


def blend_glow(base: Image.Image, paint: Image.Image, radius: int = 20) -> Image.Image:
    base = Image.alpha_composite(base.convert("RGBA"), paint.filter(ImageFilter.GaussianBlur(radius)))
    return Image.alpha_composite(base, paint).convert("RGB")


def aurora(frame: int) -> Image.Image:
    phase = 2 * math.pi * frame / FRAMES
    image = gradient((9, 17, 56), (29, 44, 91))
    overlay = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)

    for x, y, size in STARS:
        shine = int(100 + 75 * (1 + math.sin(phase + x * .03)) / 2)
        draw.ellipse((x, y, x + size, y + size), fill=(205, 235, 255, shine))

    # Broad, moving ribbons keep the animation visible even behind desktop icons.
    for band, color in enumerate(((89, 168, 248, 68), (154, 106, 234, 68), (89, 239, 215, 43))):
        points = []
        for x in range(-20, WIDTH + 21, 8):
            wave = math.sin(x / (110 + band * 20) + phase + band * 1.7)
            y = 96 + band * 48 + x * .12 + wave * (22 + band * 8)
            points.append((x, y))
        bottom = [(x, y + 86 + 12 * math.sin(x / 80 + phase)) for x, y in reversed(points)]
        draw.polygon(points + bottom, fill=color)

    # The "window" silhouette provides a recognisable focal point.
    cx, cy = 435, 240
    for radius, alpha in ((145, 20), (110, 37), (73, 54)):
        draw.ellipse((cx - radius, cy - radius, cx + radius, cy + radius), outline=(156, 207, 255, alpha), width=3)
    draw.arc((cx - 120, cy - 120, cx + 120, cy + 120), 25 + frame * 2, 180 + frame * 2, fill=(198, 231, 255, 105), width=4)
    draw.polygon([(0, 345), (200, 290), (380, 330), (720, 270), (720, 405), (0, 405)], fill=(7, 19, 58, 116))
    return blend_glow(image, overlay, 25)


def nocturne(frame: int) -> Image.Image:
    image = gradient((18, 16, 51), (79, 34, 82))
    overlay = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    draw.ellipse((392, 52, 615, 275), fill=(255, 104, 168, 94))
    draw.ellipse((430, 91, 575, 236), fill=(255, 158, 186, 120))
    draw.line((0, 303, WIDTH, 303), fill=(252, 107, 187, 125), width=3)

    for x, top, width in BUILDINGS:
        draw.rectangle((x, top, x + width, HEIGHT), fill=(14, 17, 47, 245))
        draw.rectangle((x, top, x + width, top + 3), fill=(83, 135, 221, 155))
        for y in range(top + 13, HEIGHT - 13, 14):
            for wx in range(x + 6, x + width - 4, 11):
                lit = ((wx * 7 + y * 3) % 17) < 8
                if lit:
                    draw.rectangle((wx, y, wx + 3, y + 4), fill=(245, 141, 196, 145))

    for x, y, length in RAIN:
        px = (x - frame * 10) % WIDTH
        py = (y + frame * 16) % HEIGHT
        draw.line((px, py, px - 5, py + length), fill=(149, 184, 248, 73), width=1)
    draw.polygon([(0, 354), (WIDTH, 319), (WIDTH, HEIGHT), (0, HEIGHT)], fill=(9, 15, 39, 190))
    for i in range(12):
        x = 300 + i * 34
        draw.line((x, 330, x + 10, 405), fill=(245, 93, 172, 42), width=2)
    return blend_glow(image, overlay, 15)


def matrix(frame: int) -> Image.Image:
    phase = 2 * math.pi * frame / FRAMES
    image = gradient((5, 32, 46), (5, 58, 66))
    overlay = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    horizon = 225

    for x in range(-250, 1000, 85):
        draw.line((WIDTH // 2, horizon, x, HEIGHT), fill=(62, 205, 181, 62), width=1)
    for y in (250, 280, 315, 360, 405):
        draw.line((0, y, WIDTH, y), fill=(45, 222, 170, 68), width=1)

    for i in range(25):
        x = (i * 73 + 19) % WIDTH
        offset = (frame * (4 + i % 3) + i * 53) % 340
        top = offset - 120
        for j in range(7):
            y = top + j * 17
            if 0 <= y < HEIGHT:
                alpha = 35 + j * 18
                draw.rounded_rectangle((x, y, x + 3, y + 9), radius=1, fill=(105, 255, 192, alpha))

    cx, cy = 480, 190
    radius = 82 + 7 * math.sin(phase)
    draw.ellipse((cx - radius, cy - radius, cx + radius, cy + radius), outline=(118, 255, 218, 140), width=3)
    draw.ellipse((cx - 61, cy - 61, cx + 61, cy + 61), outline=(80, 218, 214, 90), width=2)
    draw.arc((cx - 104, cy - 104, cx + 104, cy + 104), frame * 15, frame * 15 + 97, fill=(159, 255, 224, 180), width=4)
    for angle in range(0, 360, 45):
        theta = math.radians(angle) + phase / 10
        x = cx + math.cos(theta) * 109
        y = cy + math.sin(theta) * 109
        draw.ellipse((x - 3, y - 3, x + 3, y + 3), fill=(135, 255, 229, 155))
    return blend_glow(image, overlay, 13)


def synthwave(frame: int) -> Image.Image:
    phase = 2 * math.pi * frame / FRAMES
    image = gradient((28, 10, 58), (91, 27, 88))
    glow = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(glow)
    cx, cy = 465, 164
    draw.ellipse((cx - 112, cy - 112, cx + 112, cy + 112), fill=(255, 132, 124, 210))
    for line in range(7):
        y = 177 + line * 13
        draw.rectangle((cx - 112, y, cx + 112, y + 3 + line // 2), fill=(76, 26, 100, 215))
    mountains = [(0, 255), (85, 216), (155, 258), (225, 205), (302, 267), (385, 224), (480, 262), (590, 213), (720, 269), (720, 405), (0, 405)]
    draw.polygon(mountains, fill=(24, 16, 62, 240))
    horizon = 274
    for x in range(-440, 1200, 72):
        draw.line((WIDTH // 2, horizon, x, HEIGHT), fill=(81, 220, 249, 85), width=2)
    for i in range(10):
        y = horizon + round((i / 9) ** 1.75 * 135)
        y = min(HEIGHT, y + round(2 * math.sin(phase + i)))
        draw.line((0, y, WIDTH, y), fill=(246, 99, 224, 120), width=2)
    for i in range(19):
        x = (i * 97 + frame * 3) % WIDTH
        y = (i * 59) % 220
        draw.ellipse((x, y, x + 2, y + 2), fill=(255, 211, 241, 130))
    return blend_glow(image, glow, 14)


def nebula(frame: int) -> Image.Image:
    phase = 2 * math.pi * frame / FRAMES
    image = gradient((5, 14, 45), (35, 20, 79))
    glow = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(glow)
    for i, color in enumerate(((89, 177, 255, 60), (183, 112, 244, 68), (94, 242, 220, 50))):
        x = 280 + i * 100 + 24 * math.sin(phase + i)
        y = 205 - i * 38 + 14 * math.cos(phase + i)
        draw.ellipse((x - 170, y - 95, x + 170, y + 95), fill=color)
    for x, y, size in STARS:
        alpha = 80 + round(100 * (1 + math.sin(phase + x * .07 + y * .04)) / 2)
        draw.ellipse((x, y, x + size, y + size), fill=(230, 245, 255, alpha))
    cx, cy = 480, 196
    for radius, alpha in ((75, 145), (115, 75), (155, 40)):
        draw.ellipse((cx - radius, cy - radius, cx + radius, cy + radius), outline=(160, 201, 255, alpha), width=2)
    for i in range(6):
        angle = phase + i * math.tau / 6
        x, y = cx + 115 * math.cos(angle), cy + 45 * math.sin(angle)
        draw.ellipse((x - 3, y - 3, x + 3, y + 3), fill=(219, 243, 255, 190))
    return blend_glow(image, glow, 35)


def circuit(frame: int) -> Image.Image:
    image = gradient((4, 23, 43), (11, 53, 72))
    glow = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(glow)
    for i in range(14):
        y = 38 + i * 28
        turn = 100 + (i * 79) % 425
        line = [(0, y), (turn, y), (turn + 22, y + 20), (WIDTH, y + 20)]
        draw.line(line, fill=(56, 186, 213, 80), width=2)
        x = (frame * 24 + i * 91) % (WIDTH + 150) - 75
        px, py = (x, y) if x < turn else (x, y + 20)
        draw.ellipse((px - 5, py - 5, px + 5, py + 5), fill=(100, 247, 231, 220))
    for x in range(55, WIDTH, 96):
        for y in range(54, HEIGHT, 81):
            radius = 6 + (x + y) % 4
            draw.ellipse((x - radius, y - radius, x + radius, y + radius), outline=(97, 231, 220, 130), width=2)
    cx, cy = 510, 205
    draw.rounded_rectangle((cx - 71, cy - 71, cx + 71, cy + 71), radius=17, outline=(118, 246, 221, 130), width=4)
    draw.rounded_rectangle((cx - 52, cy - 52, cx + 52, cy + 52), radius=12, fill=(11, 57, 74, 215), outline=(119, 252, 228, 110), width=2)
    draw.text((cx - 22, cy - 7), "SIO", fill=(171, 255, 239, 210))
    return blend_glow(image, glow, 11)


def ocean(frame: int) -> Image.Image:
    phase = 2 * math.pi * frame / FRAMES
    image = gradient((7, 27, 69), (14, 80, 102))
    glow = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(glow)
    draw.ellipse((435, 42, 605, 212), fill=(108, 215, 237, 100))
    for band in range(9):
        base = 175 + band * 29
        color = (80 + band * 8, 195 + band * 4, 230, 48 + band * 5)
        points = []
        for x in range(-15, WIDTH + 16, 6):
            y = base + 13 * math.sin(x / (47 + band * 6) + phase * (1 + band * .08))
            points.append((x, y))
        draw.line(points, fill=color, width=3)
    for i in range(35):
        x = (i * 113 + 31) % WIDTH
        y = (i * 61 + frame * (1 + i % 3)) % HEIGHT
        draw.ellipse((x, y, x + 2, y + 2), fill=(167, 247, 255, 95))
    return blend_glow(image, glow, 21)


def save_animation(name: str, renderer) -> None:
    frames = [renderer(frame).quantize(colors=80, method=Image.Quantize.FASTOCTREE) for frame in range(FRAMES)]
    path = OUTPUT / f"{name}.gif"
    frames[0].save(path, save_all=True, append_images=frames[1:], duration=100, loop=0, optimize=True, disposal=2)
    print(f"{path.name}: {path.stat().st_size / 1024:.0f} KiB")


if __name__ == "__main__":
    OUTPUT.mkdir(parents=True, exist_ok=True)
    renderers = {"aurora": aurora, "nocturne": nocturne, "matrix": matrix, "synthwave": synthwave, "nebula": nebula, "circuit": circuit, "ocean": ocean}
    names = sys.argv[1:] or list(renderers)
    for name in names:
        if name not in renderers:
            raise SystemExit(f"Unknown wallpaper: {name}")
        save_animation(name, renderers[name])
