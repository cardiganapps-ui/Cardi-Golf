#!/usr/bin/env python3
"""
Extract the Polo symbol from the approved sheet so the app draws it identically.

Input:  design/brand/polo-logo-sheet.jpg  (Diego's approved presentation sheet)
Output (committed, read by scripts/make-icons.mjs and the app):
  src/design/logoMark.json     the symbol's outline (even-odd path, 100-unit tile),
                               its box, the lockup and wordmark measurements
  design/brand/logo-graphite.png the sheet's own pencil texture (RGBA, tile at 4x)
  design/brand/logo-gold.png     the same texture mapped to the sheet's TV gold

How: the app-icon tile on the sheet is the largest, cleanest copy of the symbol.
Its graphite is thresholded at half the stroke's density on an 8x upsample,
traced with potrace into curves, and normalised to the tile (so the symbol
sits exactly where it sits on the sheet). The texture is the tile's own pixels
at 4x, with the outermost band (where the JPEG mixes graphite and paper)
refilled from the stroke's interior so the crisp outline carries no halo. The
gold is a quantile map of that texture onto the TV copy's gold pixels. The
lockup and wordmark numbers were measured on the sheet's "Horizontal Lockup"
and fitted against Archivo (see DESIGN_NOTES.md, "Logo").

One-off tool: run it only when the sheet changes.
  pip install numpy scipy opencv-python-headless pillow potracer
  python3 scripts/brand/extract-logo.py && npm run icons
"""
import json
from pathlib import Path

import cv2
import numpy as np
import potrace
from PIL import Image
from scipy import ndimage as ndi

ROOT = Path(__file__).resolve().parents[2]
SHEET = ROOT / 'design/brand/polo-logo-sheet.jpg'
OUT = ROOT / 'src/design'
TEX_OUT = ROOT / 'design/brand'

# The app-icon tile on the sheet (sheet px): a 143-px rounded square.
TILE_X, TILE_Y, TILE = 126, 111, 143
# The TV copy of the symbol, gold on board green (sheet px).
TV_BOX = (700, 380, 800, 480)
TRACE_SCALE = 8  # upsample before thresholding and tracing
TEX_SCALE = 4  # texture resolution relative to the sheet

img = np.asarray(Image.open(SHEET).convert('RGB')).astype(np.float32)
lum = 0.299 * img[..., 0] + 0.587 * img[..., 1] + 0.114 * img[..., 2]
sat = img.max(-1) - img.min(-1)


def largest_component(mask):
    lab, n = ndi.label(mask)
    sizes = ndi.sum(mask, lab, range(1, n + 1))
    return lab == 1 + int(np.argmax(sizes))


# ---- 1. Outline -------------------------------------------------------------
tile_rgb = img[TILE_Y:TILE_Y + TILE, TILE_X:TILE_X + TILE]
tile_l = lum[TILE_Y:TILE_Y + TILE, TILE_X:TILE_X + TILE]
tile_sat = sat[TILE_Y:TILE_Y + TILE, TILE_X:TILE_X + TILE]
# The sheet's annotation arrows are red; they are not part of the symbol.
red = cv2.dilate(((tile_sat >= 35) & (tile_l < 235)).astype(np.uint8), np.ones((3, 3), np.uint8)) > 0
paper = float(np.median(tile_l[(tile_l > 225) & ~red]))
dark = np.clip(paper - tile_l, 0, None)
dark[red] = 0
core = float(np.percentile(dark[dark > 60], 50))

F = TRACE_SCALE
big = cv2.resize(dark, (TILE * F, TILE * F), interpolation=cv2.INTER_CUBIC)
big = cv2.GaussianBlur(big, (0, 0), 1.1 * F)
mask = largest_component(big > 0.5 * core)
# Fill slivers between pencil passes; keep the bowl and the loop open.
holes, n = ndi.label(~mask)
areas = ndi.sum(~mask, holes, range(1, n + 1))
for i, a in enumerate(areas, start=1):
    if a < mask.size * 0.004:
        mask[holes == i] = True

# potracer's Bitmap reads True as paper (it inverts), so hand it the paper.
paths = potrace.Bitmap(~mask).trace(
    turdsize=400,
    turnpolicy=potrace.POTRACE_TURNPOLICY_MINORITY,
    alphamax=1.2,
    opticurve=True,
    opttolerance=0.6,
)
unit = 100.0 / (TILE * F)


def pt(p):
    return f'{p.x * unit:.2f} {p.y * unit:.2f}'


d = []
for curve in paths:
    d.append(f'M{pt(curve.start_point)}')
    for seg in curve.segments:
        if seg.is_corner:
            d.append(f'L{pt(seg.c)}L{pt(seg.end_point)}')
        else:
            d.append(f'C{pt(seg.c1)} {pt(seg.c2)} {pt(seg.end_point)}')
    d.append('Z')
path_d = ''.join(d)

ys, xs = np.nonzero(mask)
bbox = {
    'x': round(xs.min() * unit, 2),
    'y': round(ys.min() * unit, 2),
    'w': round((xs.max() + 1 - xs.min()) * unit, 2),
    'h': round((ys.max() + 1 - ys.min()) * unit, 2),
}
# Android masks icons to a circle of radius 40% of the size: scale the symbol
# so its farthest point sits inside, with a hair of margin.
cy, cx = (TILE * F) / 2, (TILE * F) / 2
r_max = float(np.sqrt((xs - cx) ** 2 + (ys - cy) ** 2).max()) / (TILE * F)
maskable_scale = round(min(1.0, 0.38 / r_max), 3)

# ---- 2. Texture -------------------------------------------------------------
T = TEX_SCALE
N = TILE * T
rgb4 = cv2.resize(tile_rgb, (N, N), interpolation=cv2.INTER_LANCZOS4)
red4 = cv2.resize(red.astype(np.float32), (N, N), interpolation=cv2.INTER_LINEAR) > 0.05
mask4 = cv2.resize(mask.astype(np.float32), (N, N), interpolation=cv2.INTER_AREA) > 0.02
depth = ndi.distance_transform_edt(mask4)
interior = (depth >= 3.2) & ~red4  # past the band where the JPEG blends in paper


def extend(values, weight, sigma):
    num = cv2.GaussianBlur(values * weight[..., None], (0, 0), sigma)
    den = cv2.GaussianBlur(weight, (0, 0), sigma)
    return num / np.maximum(den, 1e-6)[..., None], den


w = interior.astype(np.float32)
near, den_near = extend(rgb4, w, 2.5)
far, _ = extend(rgb4, w, 10.0)
fill = np.where((den_near > 0.02)[..., None], near, far)
tex = np.where(interior[..., None], rgb4, fill)
alpha = cv2.dilate(mask4.astype(np.uint8), np.ones((5, 5), np.uint8)) > 0


def save_rgba(path, rgb, alpha):
    out = np.zeros((N, N, 4), np.uint8)
    out[..., :3] = np.clip(rgb, 0, 255).astype(np.uint8)
    out[..., 3] = alpha.astype(np.uint8) * 255
    out[~alpha] = 0
    Image.fromarray(out, 'RGBA').save(path, optimize=True)


save_rgba(TEX_OUT / 'logo-graphite.png', tex, alpha)

# Gold: dense graphite (dark) maps to dense gold (bright), quantile by quantile.
x0, y0, x1, y1 = TV_BOX
tv = img[y0:y1, x0:x1]
gold_mask = largest_component((tv[..., 0] > 120) & (tv[..., 0] - tv[..., 2] > 50))
# Only the line's core: its outer pixel is gold blended with the board green.
gold_px = tv[ndi.distance_transform_edt(gold_mask) >= 1.5]
gold_l = 0.299 * gold_px[:, 0] + 0.587 * gold_px[:, 1] + 0.114 * gold_px[:, 2]
order = np.argsort(-gold_l)  # brightest first
gold_sorted = gold_px[order]
tex_l = 0.299 * tex[..., 0] + 0.587 * tex[..., 1] + 0.114 * tex[..., 2]
inside = tex_l[alpha]
q = np.searchsorted(np.sort(inside), tex_l) / max(1, inside.size)  # 0 = darkest graphite
idx = np.clip((q * (len(gold_sorted) - 1)).astype(int), 0, len(gold_sorted) - 1)
# Smooth the quantile lookup so JPEG noise in the gold copy does not speckle.
bins = np.linspace(0, len(gold_sorted), 33).astype(int)
ramp = np.array([gold_sorted[a:b].mean(0) for a, b in zip(bins[:-1], bins[1:])])
pos = q * (len(ramp) - 1)
lo = np.floor(pos).astype(int).clip(0, len(ramp) - 1)
hi = np.minimum(lo + 1, len(ramp) - 1)
t = (pos - lo)[..., None]
gold = ramp[lo] * (1 - t) + ramp[hi] * t
save_rgba(TEX_OUT / 'logo-gold.png', gold, alpha)

# ---- 3. Numbers -------------------------------------------------------------
# Horizontal Lockup on the sheet (sheet px): symbol 694..764 x 145..222;
# "P" 776..825 x 151..210, so cap height 60 and the baseline under row 210.
cap = 60.0
spec = {
    '_comment': 'Generated by scripts/brand/extract-logo.py from design/brand/polo-logo-sheet.jpg. Do not edit by hand; see DESIGN_NOTES.md, "Logo".',
    'tile': 100,
    'd': path_d,
    'fillRule': 'evenodd',
    'bbox': bbox,
    'maskableScale': maskable_scale,
    # The sheet's app-icon tile rounds its corners at about 18 of 143 px.
    'tileRadius': round(18 / TILE, 3),
    'lockup': {
        '_comment': 'Measured on the sheet\'s Horizontal Lockup, in cap heights: symbol height, how far it drops below the baseline, and the ink gap to the P.',
        'markHeight': round(78 / cap, 3),
        'belowBaseline': round(12 / cap, 3),
        'gap': round(11 / cap, 3),
    },
    'wordmark': {
        '_comment': 'Archivo settings fitted to the sheet\'s wordmark (95.3% overlap): weight, width axis, letter-spacing in em; capHeight and the P\'s left side bearing in em.',
        'weight': 740,
        'width': 98,
        'letterSpacing': -0.015,
        'capHeight': 0.686,
        'pSideBearing': 0.075,
    },
}
(OUT / 'logoMark.json').write_text(json.dumps(spec, indent=2) + '\n')
print('paper L', round(paper, 1), 'core darkness', round(core, 1))
print('bbox', bbox, 'maskable scale', maskable_scale, 'path chars', len(path_d))
