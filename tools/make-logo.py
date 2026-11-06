#!/usr/bin/env python3
"""Draw the extension logo: ../docs/icon.svg (128x128, Adwaita-like)."""
import pathlib

OUT = pathlib.Path(__file__).resolve().parent.parent / 'docs' / 'icon.svg'

# Gamepad body: two grips joined by a bridge, symmetric around x=64.
BODY = ('M38,38 C24,38 17,48 14,62 L9,88 C6,102 17,110 27,101 L41,88 '
        'L87,88 L101,101 C111,110 122,102 119,88 L114,62 C111,48 104,38 90,38 Z')


def dpad(cx, cy, arm=8.5, half=3.6, fill='#4a3f8f'):
    a, t = half, arm
    d = (f"M{cx-a},{cy-t} h{2*a} v{t-a} h{t-a} v{2*a} h-{t-a} v{t-a} h-{2*a} "
         f"v-{t-a} h-{t-a} v-{2*a} h{t-a} Z")
    return f"<path d='{d}' fill='{fill}' stroke='{fill}' stroke-width='1.6' stroke-linejoin='round'/>"


def tiles(cx, cy, s=8.4, gap=2.8):
    # four app tiles instead of face buttons (GNOME palette)
    colors = ['#3584e4', '#2ec27e', '#ff7800', '#c061cb']
    out = ''
    for i, c in enumerate(colors):
        x = cx - s - gap / 2 + (i % 2) * (s + gap)
        y = cy - s - gap / 2 + (i // 2) * (s + gap)
        out += f"<rect x='{x:.1f}' y='{y:.1f}' width='{s}' height='{s}' rx='2.6' fill='{c}'/>"
    return out


svg = f"""<svg xmlns='http://www.w3.org/2000/svg' width='128' height='128' viewBox='0 0 128 128'>
  <defs>
    <linearGradient id='bg' x1='0' y1='0' x2='0' y2='1'>
      <stop offset='0' stop-color='#8f6be8'/>
      <stop offset='1' stop-color='#5b3cc4'/>
    </linearGradient>
    <linearGradient id='pad' x1='0' y1='0' x2='0' y2='1'>
      <stop offset='0' stop-color='#ffffff'/>
      <stop offset='1' stop-color='#e3dff2'/>
    </linearGradient>
  </defs>
  <rect x='4' y='4' width='120' height='120' rx='28' fill='url(#bg)'/>
  <rect x='4' y='4' width='120' height='60' rx='28' fill='#ffffff' opacity='0.06'/>
  <g transform='translate(0,6)'>
    <path d='{BODY}' fill='#2a1b6b' opacity='0.35' transform='translate(0,4)'/>
    <path d='{BODY}' fill='url(#pad)'/>
    {dpad(40, 57)}
    {tiles(88, 57)}
    <rect x='56' y='52' width='6' height='3.2' rx='1.6' fill='#4a3f8f' opacity='0.7'/>
    <rect x='66' y='52' width='6' height='3.2' rx='1.6' fill='#4a3f8f' opacity='0.7'/>
    <circle cx='52' cy='74' r='7' fill='#4a3f8f' opacity='0.18'/>
    <circle cx='76' cy='74' r='7' fill='#4a3f8f' opacity='0.18'/>
  </g>
</svg>
"""
OUT.write_text(svg)
print('wrote', OUT)
