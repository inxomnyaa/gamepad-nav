#!/usr/bin/env python3
"""Generate the button glyph SVGs in ../icons/<family>/<key>.svg.

Shapes are drawn as geometry so centring never depends on font metrics;
the few text labels use a fixed cap-height baseline offset.
"""
import pathlib

OUT = pathlib.Path(__file__).resolve().parent.parent / 'icons'
H = 32
DARK = '#3a3a40'
RIM = 'rgba(255,255,255,0.35)'
WHITE = '#ffffff'
FONT = "font-family='Cantarell, Inter, sans-serif' font-weight='800'"


def svg(w, body):
    return (f"<svg xmlns='http://www.w3.org/2000/svg' width='{w}' height='{H}' "
            f"viewBox='0 0 {w} {H}'>{body}</svg>\n")


def text(x, y_center, s, size, fill=WHITE):
    base = y_center + size * 0.36  # cap height ~0.72em
    return (f"<text x='{x}' y='{base:.2f}' text-anchor='middle' font-size='{size}' "
            f"{FONT} fill='{fill}'>{s}</text>")


def disc(fill=DARK, rim=True):
    stroke = f" stroke='{RIM}' stroke-width='1.5'" if rim else ''
    return f"<circle cx='16' cy='16' r='14.5' fill='{fill}'{stroke}/>"


def letter_disc(ch, fill):
    return svg(32, disc(fill, rim=fill == DARK) + text(16, 16, ch, 17))


def pill(label, w=44, size=12, top_round=False):
    r = 9
    if top_round:  # triggers: rounder top edge
        shape = (f"<path d='M2,{H-3} L2,13 Q2,3 14,3 L{w-14},3 Q{w-2},3 {w-2},13 "
                 f"L{w-2},{H-6} Q{w-2},{H-3} {w-5},{H-3} L5,{H-3} Q2,{H-3} 2,{H-6} Z' fill='{DARK}' stroke='{RIM}' stroke-width='1.5'/>")
    else:
        shape = (f"<rect x='2' y='5' width='{w-4}' height='{H-10}' rx='{r}' "
                 f"fill='{DARK}' stroke='{RIM}' stroke-width='1.5'/>")
    cy = 17.5 if top_round else 16
    return svg(w, shape + text(w / 2, cy, label, size))


def dpad():  # dark disc like the other buttons, white cross
    a, t, c = 2.6, 8.5, 16  # arm half-width, arm reach from center
    d = (f"M{c-a},{c-t} h{2*a} v{t-a} h{t-a} v{2*a} h-{t-a} v{t-a} h-{2*a} "
         f"v-{t-a} h-{t-a} v-{2*a} h{t-a} Z")
    return svg(32, disc() + f"<path d='{d}' fill='#ffffff' stroke='#ffffff' "
               "stroke-width='1.2' stroke-linejoin='round'/>")


def stick(label, size=13):
    return svg(32, f"<circle cx='16' cy='16' r='14' fill='none' stroke='{RIM}' stroke-width='2'/>"
               f"<circle cx='16' cy='16' r='10' fill='{DARK}'/>" + text(16, 16, label, size))


def home():
    house = ("<path d='M16,8.5 L24,15.5 L21.5,15.5 L21.5,23 L18,23 L18,18.5 L14,18.5 "
             "L14,23 L10.5,23 L10.5,15.5 L8,15.5 Z' fill='#ffffff'/>")
    return svg(32, disc() + house)


def view():  # two overlapping windows
    return svg(32, disc() +
               "<rect x='9' y='9' width='10' height='8' rx='1.5' fill='none' stroke='#fff' stroke-width='2'/>"
               "<rect x='13' y='14' width='10' height='8' rx='1.5' fill='#3a3a40' stroke='#fff' stroke-width='2'/>")


def menu():  # hamburger
    lines = ''.join(f"<rect x='10' y='{y}' width='12' height='2.2' rx='1.1' fill='#fff'/>"
                    for y in (10.4, 14.9, 19.4))
    return svg(32, disc() + lines)


def sign(plus):
    s = "<rect x='10' y='14.9' width='12' height='2.2' rx='1.1' fill='#fff'/>"
    if plus:
        s += "<rect x='14.9' y='10' width='2.2' height='12' rx='1.1' fill='#fff'/>"
    return svg(32, disc() + s)


def ps_shape(kind):
    sw = "fill='none' stroke-width='2.4' stroke-linejoin='round' stroke-linecap='round'"
    shapes = {
        'cross': f"<path d='M11,11 L21,21 M21,11 L11,21' stroke='#8ab4ff' {sw}/>",
        'circle': f"<circle cx='16' cy='16' r='6' stroke='#ff7a7a' {sw}/>",
        'square': f"<rect x='10.5' y='10.5' width='11' height='11' stroke='#f59ad8' {sw}/>",
        'triangle': f"<path d='M16,9.5 L22.5,20.5 L9.5,20.5 Z' stroke='#5fd4a8' {sw}/>",
    }
    # optical centre: the triangle sits a bit low in its box
    body = shapes[kind]
    if kind == 'triangle':
        body = f"<g transform='translate(0,1)'>{body}</g>"
    return svg(32, disc() + body)


common = {
    'dpad': dpad(),
    'left-stick': stick('L'), 'right-stick': stick('R'),
    'l3': stick('L3', 10), 'r3': stick('R3', 10),
}
families = {
    'xbox': {
        'a': letter_disc('A', '#3e9a14'), 'b': letter_disc('B', '#c62828'),
        'x': letter_disc('X', '#1e6fc2'), 'y': letter_disc('Y', '#d39e00'),
        'lb': pill('LB'), 'rb': pill('RB'),
        'lt': pill('LT', top_round=True), 'rt': pill('RT', top_round=True),
        'back': view(), 'start': menu(), 'guide': home(),
    },
    'playstation': {
        'a': ps_shape('cross'), 'b': ps_shape('circle'),
        'x': ps_shape('triangle'), 'y': ps_shape('square'),
        'lb': pill('L1'), 'rb': pill('R1'),
        'lt': pill('L2', top_round=True), 'rt': pill('R2', top_round=True),
        'back': pill('SHARE', 52, 8.5), 'start': pill('OPTIONS', 52, 8),
        'guide': svg(32, disc() + text(16, 16, 'PS', 11)),
    },
    'nintendo': {
        # hid-nintendo reports by position: south=B, east=A, north=X, west=Y
        'a': letter_disc('B', DARK), 'b': letter_disc('A', DARK),
        'x': letter_disc('X', DARK), 'y': letter_disc('Y', DARK),
        'lb': pill('L'), 'rb': pill('R'),
        'lt': pill('ZL', top_round=True), 'rt': pill('ZR', top_round=True),
        'back': sign(False), 'start': sign(True), 'guide': home(),
    },
}
for fam, icons in families.items():
    d = OUT / fam
    d.mkdir(parents=True, exist_ok=True)
    for key, data in {**common, **icons}.items():
        (d / f'{key}.svg').write_text(data)
print('wrote', sum(1 for _ in OUT.rglob('*.svg')), 'icons')
