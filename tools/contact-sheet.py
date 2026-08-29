#!/usr/bin/env python3
"""
Every 375px screenshot on one sheet.

The full-page captures are up to 20,000px tall, which is not something anyone
can look at. This lays them out side by side at a readable scale, each column
one page, so the whole site can be taken in at once — and so two pages can be
compared without scrolling between them.

Columns are capped in height and marked where they were cut, because a column
that silently stops is worse than one that says it was trimmed.
"""
import os, sys
from PIL import Image, ImageDraw, ImageFont

SHOTS = sys.argv[1] if len(sys.argv) > 1 else '.shots'
OUT = sys.argv[2] if len(sys.argv) > 2 else '.shots/contact-sheet.png'

COL_W = 300          # each page rendered this wide
MAX_H = 2600         # and cut here
GAP = 28
PAD = 32
LABEL_H = 46
BG = (247, 242, 234)      # cream
INK = (51, 38, 28)        # espresso
MUTE = (107, 86, 70)      # espresso-70
CLAY = (169, 135, 68)

files = sorted(f for f in os.listdir(SHOTS) if f.endswith('.png') and f != os.path.basename(OUT))
if not files:
    sys.exit('no screenshots found')

def font(size, bold=False):
    for p in ('/usr/share/fonts/truetype/dejavu/DejaVuSans%s.ttf' % ('-Bold' if bold else ''),
              '/usr/share/fonts/truetype/liberation/LiberationSans%s.ttf' % ('-Bold' if bold else '')):
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()

f_name, f_meta = font(15, True), font(12)

cols = []
for name in files:
    im = Image.open(os.path.join(SHOTS, name)).convert('RGB')
    scale = COL_W / im.width
    h = int(im.height * scale)
    im = im.resize((COL_W, h), Image.LANCZOS)
    cut = h > MAX_H
    if cut:
        im = im.crop((0, 0, COL_W, MAX_H))
    label = name.split('-', 1)[1].rsplit('.', 1)[0].replace('-', ' ')
    cols.append((label, im, int(h / scale * scale), cut, int(h)))

sheet_h = PAD * 2 + LABEL_H + max(c[1].height for c in cols)
sheet_w = PAD * 2 + len(cols) * COL_W + (len(cols) - 1) * GAP
sheet = Image.new('RGB', (sheet_w, sheet_h), BG)
d = ImageDraw.Draw(sheet)

x = PAD
for label, im, _, cut, full_h in cols:
    d.text((x, PAD), label.upper(), font=f_name, fill=INK)
    d.text((x, PAD + 20), f'{full_h}px tall' + ('  (trimmed)' if cut else ''), font=f_meta, fill=MUTE)
    top = PAD + LABEL_H
    sheet.paste(im, (x, top))
    d.rectangle([x, top, x + COL_W - 1, top + im.height - 1], outline=(220, 212, 200))
    d.line([x, PAD + LABEL_H - 8, x + COL_W, PAD + LABEL_H - 8], fill=CLAY, width=2)
    if cut:
        y = top + im.height - 1
        for dash in range(x, x + COL_W, 12):
            d.line([dash, y, dash + 6, y], fill=CLAY, width=3)
    x += COL_W + GAP

sheet.save(OUT, optimize=True)
print(f'{OUT} — {len(cols)} pages, {sheet_w}x{sheet_h}, {os.path.getsize(OUT)//1024}KB')
