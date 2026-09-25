#!/usr/bin/env python3
"""
Gera os ícones PNG do PWA a partir do desenho de public/icon.svg.

Por que existe: iOS ignora ícone SVG (apple-touch-icon) e o Chrome exige PNG
192/512 para instalação. Sem dependências externas (nem Pillow): o PNG é
escrito à mão (zlib + struct) e as formas são rasterizadas por teste
analítico por pixel, com supersampling 2x2 e downsample por box filter.

Uso:  python3 scripts/generate-icons.py
Saída: public/icon-192.png, public/icon-512.png, public/icon-maskable-512.png,
       public/apple-touch-icon.png
"""

import os
import struct
import zlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUBLIC = os.path.join(ROOT, "public")

BASE = 512          # resolução de render
SAMPLES = [(0.25, 0.25), (0.75, 0.25), (0.25, 0.75), (0.75, 0.75)]

# ----------------------------------------------------------------- cores
def hexa(value):
    value = value.lstrip("#")
    return tuple(int(value[i : i + 2], 16) for i in (0, 2, 4))


GRAD_START = hexa("#8B5CF6")
GRAD_END = hexa("#4F46E5")
WHITE = (255, 255, 255)
SPINE = hexa("#7C3AED")
PAGE_LINE = hexa("#9333EA")
STAR = hexa("#FACC15")


def lerp(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


def blend(base, color, alpha):
    if alpha <= 0:
        return base
    if alpha >= 1:
        return color
    return tuple(int(round(base[i] * (1 - alpha) + color[i] * alpha)) for i in range(3))


# ----------------------------------------------------------------- formas
def in_rounded_rect(x, y, x0, y0, x1, y1, r):
    """Retângulo arredondado (cantos com raio r) no espaço 0..100."""
    if x < x0 or x > x1 or y < y0 or y > y1:
        return False
    cx = None
    cy = None
    if x < x0 + r and y < y0 + r:
        cx, cy = x0 + r, y0 + r
    elif x > x1 - r and y < y0 + r:
        cx, cy = x1 - r, y0 + r
    elif x < x0 + r and y > y1 - r:
        cx, cy = x0 + r, y1 - r
    elif x > x1 - r and y > y1 - r:
        cx, cy = x1 - r, y1 - r
    if cx is None:
        return True
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r


def in_upper_half_ellipse(x, y, cx, cy, rx, ry):
    if y < cy - ry or y > cy:
        return False
    return ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1.0


def in_circle(x, y, cx, cy, r):
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r


STAR_POINTS = [
    (50, 20),
    (53.5, 30),
    (63.5, 30),
    (55, 36.5),
    (58.5, 46.5),
    (50, 40),
    (41.5, 46.5),
    (45, 36.5),
    (36.5, 30),
    (46.5, 30),
]


def in_polygon(x, y, points):
    inside = False
    j = len(points) - 1
    for i in range(len(points)):
        xi, yi = points[i]
        xj, yj = points[j]
        if (yi > y) != (yj > y):
            x_cross = (xj - xi) * (y - yi) / (yj - yi + 1e-12) + xi
            if x < x_cross:
                inside = not inside
        j = i
    return inside


PAGE_LINES = [((30, 58), (42, 58)), ((30, 65), (40, 65)), ((58, 58), (70, 58)), ((60, 65), (70, 65))]
DOTS = [(36, 88), (43, 90), (50, 90.5), (57, 90), (64, 88)]


def paint(x, y, scale=1.0, cx=50.0, cy=50.0):
    """Cor RGBA do ponto (x, y) no espaço 0..100. scale<1 = variante maskable."""
    if scale != 1.0:
        x = cx + (x - cx) / scale
        y = cy + (y - cy) / scale

    # Fundo: quadrado arredondado com gradiente diagonal.
    if not in_rounded_rect(x, y, 0, 0, 100, 100, 22 if scale == 1.0 else 0):
        return (0, 0, 0, 0)
    t = (x + y) / 200.0
    color = lerp(GRAD_START, GRAD_END, t)

    # Livro aberto: corpo + duas "páginas" arqueadas.
    book = in_rounded_rect(x, y, 22, 62, 78, 80, 8) or in_upper_half_ellipse(
        x, y, 36, 62, 14, 12
    ) or in_upper_half_ellipse(x, y, 64, 62, 14, 12)
    if book:
        color = blend(color, WHITE, 0.95)

    # Lombada central.
    if 49.0 <= x <= 51.0 and 50 <= y <= 80:
        color = blend(color, SPINE, 1.0)

    # Linhas das páginas.
    for (x0, y0), (x1, y1) in PAGE_LINES:
        if x0 - 1.25 <= x <= x1 + 1.25 and y0 - 1.25 <= y <= y1 + 1.25:
            color = blend(color, PAGE_LINE, 0.6)

    # Estrela.
    if in_polygon(x, y, STAR_POINTS):
        color = blend(color, STAR, 1.0)

    # Arco de pontos na base.
    for dx, dy in DOTS:
        if in_circle(x, y, dx, dy, 2):
            color = blend(color, WHITE, 0.8)
            break

    return (color[0], color[1], color[2], 255)


def render(size, scale=1.0):
    """Renderiza em `size` px partindo do espaço 0..100 com supersampling."""
    factor = size / 100.0
    pixels = bytearray(size * size * 4)
    sub = 1.0 / len(SAMPLES)
    for row in range(size):
        for col in range(size):
            r = g = b = a = 0.0
            for sx, sy in SAMPLES:
                x = (col + sx) / factor
                y = (row + sy) / factor
                pr, pg, pb, pa = paint(x, y, scale)
                r += pr * sub
                g += pg * sub
                b += pb * sub
                a += pa * sub
            offset = (row * size + col) * 4
            pixels[offset] = int(round(r))
            pixels[offset + 1] = int(round(g))
            pixels[offset + 2] = int(round(b))
            pixels[offset + 3] = int(round(a))
    return pixels


def downsample(pixels, src, dst):
    """Box filter: reduz o render 512 para os tamanhos menores."""
    out = bytearray(dst * dst * 4)
    ratio = src / dst
    for row in range(dst):
        y0 = int(row * ratio)
        y1 = max(y0 + 1, int((row + 1) * ratio))
        for col in range(dst):
            x0 = int(col * ratio)
            x1 = max(x0 + 1, int((col + 1) * ratio))
            totals = [0.0, 0.0, 0.0, 0.0]
            count = 0
            for yy in range(y0, min(y1, src)):
                base_y = yy * src * 4
                for xx in range(x0, min(x1, src)):
                    offset = base_y + xx * 4
                    for i in range(4):
                        totals[i] += pixels[offset + i]
                    count += 1
            count = max(count, 1)
            offset = (row * dst + col) * 4
            for i in range(4):
                out[offset + i] = int(round(totals[i] / count))
    return out


def write_png(path, size, pixels):
    raw = b"".join(
        b"\x00" + bytes(pixels[y * size * 4 : (y + 1) * size * 4]) for y in range(size)
    )

    def chunk(kind, data):
        return (
            struct.pack(">I", len(data))
            + kind
            + data
            + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)
        )

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(bytes(raw), 9))
    png += chunk(b"IEND", b"")

    with open(path, "wb") as handle:
        handle.write(png)
    print(f"  ✔ {os.path.relpath(path, ROOT)} ({size}x{size}, {len(png)//1024} KB)")


def main():
    os.makedirs(PUBLIC, exist_ok=True)
    print("Renderizando ícone base 512x512 (supersampling 2x2)...")
    base = render(BASE, 1.0)
    print("Renderizando variante maskable 512x512 (conteúdo a 80%)...")
    maskable = render(BASE, 0.8)

    write_png(os.path.join(PUBLIC, "icon-512.png"), BASE, base)
    write_png(os.path.join(PUBLIC, "icon-maskable-512.png"), BASE, maskable)
    write_png(os.path.join(PUBLIC, "icon-192.png"), 192, downsample(base, BASE, 192))
    write_png(
        os.path.join(PUBLIC, "apple-touch-icon.png"),
        180,
        downsample(base, BASE, 180),
    )
    write_png(os.path.join(PUBLIC, "icon-32.png"), 32, downsample(base, BASE, 32))


if __name__ == "__main__":
    main()
