#!/usr/bin/env python3
"""Draw the extension logo: ../docs/icon.svg (128x128 viewBox).

A dark screen showing an app grid with one tile selected (the controller's
focus ring), and a light controller in front of it.
"""
import pathlib

OUT = pathlib.Path(__file__).resolve().parent.parent / 'docs' / 'icon.svg'
BLUE, GREEN, ORANGE, PURPLE, YELLOW, LIGHTBLUE, RED = (
    '#3584e4', '#2ec27e', '#ff7800', '#9141ac', '#f6d32d', '#62a0ea', '#e01b24')


def grad(gid, a, b):
    return (f"<linearGradient id='{gid}' x1='0' y1='0' x2='0' y2='1'>"
            f"<stop offset='0' stop-color='{a}'/><stop offset='1' stop-color='{b}'/></linearGradient>")


def tile(x, y, s, color, r):
    return f"<rect x='{x:.1f}' y='{y:.1f}' width='{s}' height='{s}' rx='{r}' fill='{color}'/>"


def ring(x, y, s, pad, r, w):
    return (f"<rect x='{x - pad:.1f}' y='{y - pad:.1f}' width='{s + 2 * pad:.1f}' height='{s + 2 * pad:.1f}' "
            f"rx='{r + pad:.1f}' fill='none' stroke='#ffffff' stroke-width='{w}'/>")


def pad_path(x, y, s):
    """Controller silhouette with its top-left at (x, y), ~100*s wide."""
    pts = [(70, 0), (84, 0, 96, 8, 99, 24), (103, 46), (106, 62, 94, 70, 84, 60), (74, 48),
           (26, 48), (16, 60), (6, 70, -6, 62, -3, 46), (1, 24), (4, 8, 16, 0, 30, 0)]
    d = f"M{x + 30 * s:.1f},{y}"
    for p in pts:
        if len(p) == 2:
            d += f" L{x + p[0] * s:.1f},{y + p[1] * s:.1f}"
        else:
            d += " C" + ' '.join(f"{x + p[i] * s:.1f},{y + p[i + 1] * s:.1f}" for i in (0, 2, 4))
    return d + ' Z'


def cross(cx, cy, arm, half, fill):
    a, t = half, arm
    d = (f"M{cx - a},{cy - t} h{2 * a} v{t - a} h{t - a} v{2 * a} h-{t - a} v{t - a} h-{2 * a} "
         f"v-{t - a} h-{t - a} v-{2 * a} h{t - a} Z")
    return f"<path d='{d}' fill='{fill}' stroke='{fill}' stroke-width='2' stroke-linejoin='round'/>"


defs = grad('pad', '#ffffff', '#deddda') + grad('screen', '#3d3846', '#2a2533')
body = "<rect x='10' y='14' width='108' height='76' rx='10' fill='#241f31'/>"   # screen depth
body += "<rect x='10' y='10' width='108' height='76' rx='10' fill='url(#screen)'/>"

# app grid: 3x2 tiles, bottom-middle one selected
s, g = 15, 6
x0 = 64 - (3 * s + 2 * g) / 2
y0 = 17
for i, color in enumerate([BLUE, GREEN, ORANGE, PURPLE, YELLOW, LIGHTBLUE]):
    body += tile(x0 + (i % 3) * (s + g), y0 + (i // 3) * (s + g), s, color, 4.5)
body += ring(x0 + (s + g), y0 + (s + g), s, 3, 4.5, 2.8)

# controller in front
P = pad_path(26, 66, 0.76)
body += f"<path d='{P}' fill='#9a9996' transform='translate(0,6)'/><path d='{P}' fill='url(#pad)'/>"
body += cross(45, 83, 7.5, 3.2, '#5e5c64')
for dx, dy, color in [(0, -6, GREEN), (-6, 0, BLUE), (6, 0, RED), (0, 6, YELLOW)]:
    body += f"<circle cx='{83 + dx}' cy='{83 + dy}' r='3.2' fill='{color}'/>"

OUT.write_text(f"<svg xmlns='http://www.w3.org/2000/svg' width='128' height='128' "
               f"viewBox='0 0 128 128'><defs>{defs}</defs>{body}</svg>\n")
print('wrote', OUT)
