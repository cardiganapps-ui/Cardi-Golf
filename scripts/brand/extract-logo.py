#!/usr/bin/env python3
"""
Lift the Polo logo off the approved sheet so the app shows it exactly as drawn.

Input:  design/brand/polo-logo-sheet.jpg  (Diego's approved presentation sheet)
Output (committed; scripts/make-icons.mjs and the app read them):
  design/brand/layer-icon.png    the app-icon copy's pencil layer, whole tile (RGBA, 4x)
  design/brand/layer-lockup.png  the Horizontal Lockup's symbol (RGBA, 4x)
  design/brand/layer-board.png   the TV study's gold symbol (RGBA, 4x)
  src/design/logoMark.json       the icon copy's outline (favicon, Android safe
                                 zone), the tile's corner radius, and the geometry
                                 of both lockups

Nothing is redrawn. Each use takes the copy the sheet shows for it, and the
pencil is separated from what it sits on pixel by pixel: alpha is how much
graphite (or gold) covers the paper (or the board), and the colour is un-mixed
from it, so the layer composited on the same paper gives back the sheet's own
pixels: its grain, its double pencil lines, its soft edges.

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
JSON_OUT = ROOT / 'src/design/logoMark.json'
LAYERS = ROOT / 'design/brand'

SCALE = 4  # layers are stored at 4x the sheet
PAD = 3  # sheet px kept around a symbol's ink for its soft edge
# Copies on the sheet (sheet px, x0 y0 x1 y1, exclusive ends).
TILE = (126, 111, 269, 254)  # "Symbol / App Icon": the 143-px tile
LOCKUP = (684, 135, 772, 232)  # "Horizontal Lockup": its symbol
LOCKUP_WORD = (772, 135, 980, 232)  # ... and its word
BOARD = (700, 375, 800, 475)  # "Reversed Dark TV Board": its symbol
BOARD_WORD = (785, 390, 965, 460)  # ... and its word (cream)

img = np.asarray(Image.open(SHEET).convert('RGB')).astype(np.float32)


def luma(a):
    return 0.299 * a[..., 0] + 0.587 * a[..., 1] + 0.114 * a[..., 2]


lum = luma(img)
sat = img.max(-1) - img.min(-1)


def crop(a, box):
    x0, y0, x1, y1 = box
    return a[y0:y1, x0:x1]


def largest_component(mask):
    lab, n = ndi.label(mask)
    sizes = ndi.sum(mask, lab, range(1, n + 1))
    return lab == 1 + int(np.argmax(sizes))


def first_letter(box, light):
    """Bounding box (sheet px, inclusive) of the leftmost letter in `box`."""
    l, s = crop(lum, box), crop(sat, box)
    ink = (l > 170) & (s < 60) if light else (l < 140) & (s < 45)
    lab, _ = ndi.label(ink)
    boxes = [sl for sl in ndi.find_objects(lab) if (sl[0].stop - sl[0].start) > 20]
    ys, xs = min(boxes, key=lambda sl: sl[1].start)
    return xs.start + box[0], ys.start + box[1], xs.stop - 1 + box[0], ys.stop - 1 + box[1]


def layer(box, kind):
    """Straight-alpha RGBA of the symbol in `box` at SCALE, and its ink box (sheet px)."""
    rgb = crop(img, box)
    h, w = rgb.shape[:2]
    up = cv2.resize(rgb, (w * SCALE, h * SCALE), interpolation=cv2.INTER_LANCZOS4)
    l, s = crop(lum, box), crop(sat, box)
    if kind == 'graphite':
        ink = largest_component((l < 170) & (s < 45))  # the sheet's red arrows are left out
        base = np.median(rgb[(l > 225) & (s < 35)], axis=0)  # the paper
        dark = l[ink]
        pigment = rgb[ink & (l <= np.percentile(dark, 5))].mean(0)
        alpha = (luma(base) - luma(up)) / (luma(base) - np.percentile(dark, 1))
    else:  # gold on the board
        ink = largest_component((rgb[..., 0] > 120) & (rgb[..., 0] - rgb[..., 2] > 50))
        base = np.median(rgb[(rgb[..., 1] < 80) & (rgb[..., 0] < 60)], axis=0)  # board green
        gold = rgb[ink]
        pigment = gold[luma(gold) >= np.percentile(luma(gold), 95)].mean(0)
        axis = pigment - base
        alpha = ((up - base) @ axis) / (axis @ axis)
    alpha = np.clip((alpha - 0.05) / 0.95, 0, 1)
    near = cv2.dilate(ink.astype(np.uint8), np.ones((5, 5), np.uint8))
    alpha[cv2.resize(near, (w * SCALE, h * SCALE), interpolation=cv2.INTER_NEAREST) == 0] = 0
    # Un-mix: over `base`, (colour, alpha) composites back to the sheet's pixel.
    colour = base + (up - base) / np.maximum(alpha, 1e-3)[..., None]
    colour = np.where((alpha >= 0.12)[..., None], colour, pigment)
    rgba = np.dstack([np.clip(colour, 0, 255), alpha * 255]).round().astype(np.uint8)
    rgba[alpha == 0] = 0
    ys, xs = np.nonzero(alpha >= 0.5)
    ink_box = (
        box[0] + xs.min() / SCALE,
        box[1] + ys.min() / SCALE,
        box[0] + (xs.max() + 1) / SCALE,
        box[1] + (ys.max() + 1) / SCALE,
    )
    print(f'{kind:8s} paper/board {base.round()} pigment {pigment.round()} ink box {tuple(round(v, 2) for v in ink_box)}')
    return rgba, ink_box


def cropped(rgba, box, ink_box):
    """The layer cut to the ink box plus PAD, and that cut's box in sheet px."""
    x0 = int(np.floor(ink_box[0])) - PAD
    y0 = int(np.floor(ink_box[1])) - PAD
    x1 = int(np.ceil(ink_box[2])) + PAD
    y1 = int(np.ceil(ink_box[3])) + PAD
    cut = rgba[(y0 - box[1]) * SCALE:(y1 - box[1]) * SCALE, (x0 - box[0]) * SCALE:(x1 - box[0]) * SCALE]
    return cut, (x0, y0, x1, y1)


def lockup_geometry(cut_box, word_box, light):
    """The symbol's cut, relative to the word's P, in cap heights."""
    px0, py0, _, py1 = first_letter(word_box, light)
    cap = py1 + 1 - py0
    x0, y0, x1, y1 = cut_box
    return {
        'aspect': round((x1 - x0) / (y1 - y0), 4),
        'markHeight': round((y1 - y0) / cap, 4),
        'belowBaseline': round((y1 - (py1 + 1)) / cap, 4),
        'gap': round((px0 - x1) / cap, 4),
        'capPx': cap,
    }


# ---- 1. Layers -------------------------------------------------------------
LAYERS.mkdir(parents=True, exist_ok=True)
icon, _ = layer(TILE, 'graphite')
Image.fromarray(icon, 'RGBA').save(LAYERS / 'layer-icon.png', optimize=True)

lock, lock_ink = layer(LOCKUP, 'graphite')
lock_cut, lock_box = cropped(lock, LOCKUP, lock_ink)
Image.fromarray(np.ascontiguousarray(lock_cut), 'RGBA').save(LAYERS / 'layer-lockup.png', optimize=True)

board, board_ink = layer(BOARD, 'gold')
board_cut, board_box = cropped(board, BOARD, board_ink)
Image.fromarray(np.ascontiguousarray(board_cut), 'RGBA').save(LAYERS / 'layer-board.png', optimize=True)

# ---- 2. Outline of the icon copy (favicon, Android safe zone) ---------------
F = 8
tl, ts = crop(lum, TILE), crop(sat, TILE)
red = cv2.dilate(((ts >= 35) & (tl < 235)).astype(np.uint8), np.ones((3, 3), np.uint8)) > 0
paper = float(np.median(tl[(tl > 225) & ~red]))
dark = np.clip(paper - tl, 0, None)
dark[red] = 0
core = float(np.percentile(dark[dark > 60], 50))
n = tl.shape[0]
big = cv2.GaussianBlur(cv2.resize(dark, (n * F, n * F), interpolation=cv2.INTER_CUBIC), (0, 0), 1.1 * F)
mask = largest_component(big > 0.5 * core)
holes, count = ndi.label(~mask)
areas = ndi.sum(~mask, holes, range(1, count + 1))
for i, a in enumerate(areas, start=1):
    if a < mask.size * 0.004:
        mask[holes == i] = True
# potracer's Bitmap reads True as paper (it inverts), so hand it the paper.
paths = potrace.Bitmap(~mask).trace(
    turdsize=400, turnpolicy=potrace.POTRACE_TURNPOLICY_MINORITY, alphamax=1.2, opticurve=True, opttolerance=0.6
)
unit = 100.0 / (n * F)


def pt(p):
    return f'{p.x * unit:.2f} {p.y * unit:.2f}'


d = []
for curve in paths:
    d.append(f'M{pt(curve.start_point)}')
    for seg in curve.segments:
        d.append(f'L{pt(seg.c)}L{pt(seg.end_point)}' if seg.is_corner else f'C{pt(seg.c1)} {pt(seg.c2)} {pt(seg.end_point)}')
    d.append('Z')
ys, xs = np.nonzero(mask)
r_max = float(np.sqrt((xs - n * F / 2) ** 2 + (ys - n * F / 2) ** 2).max()) / (n * F)

# ---- 3. Numbers -------------------------------------------------------------
spec = {
    '_comment': 'Generated by scripts/brand/extract-logo.py from design/brand/polo-logo-sheet.jpg. Do not edit by hand; see DESIGN_NOTES.md, "Logo".',
    'tile': 100,
    'd': ''.join(d),
    'fillRule': 'evenodd',
    'bbox': {
        'x': round(float(xs.min()) * unit, 2),
        'y': round(float(ys.min()) * unit, 2),
        'w': round(float(xs.max() + 1 - xs.min()) * unit, 2),
        'h': round(float(ys.max() + 1 - ys.min()) * unit, 2),
    },
    # Android crops icons to a circle of radius 40%: shrink so the loop stays in.
    'maskableScale': round(min(1.0, 0.38 / r_max), 3),
    # The sheet's app-icon tile rounds its corners at about 18 of 143 px.
    'tileRadius': round(18 / (TILE[2] - TILE[0]), 3),
    'lockups': {
        '_comment': 'Each lockup as the sheet draws it, in cap heights of the word: the symbol image (its ink plus a soft edge) and where it sits against the P. standard = "Horizontal Lockup"; board = "Reversed Dark TV Board".',
        'standard': {'image': '/brand/polo-mark.png', **lockup_geometry(lock_box, LOCKUP_WORD, light=False)},
        'board': {'image': '/brand/polo-mark-board.png', **lockup_geometry(board_box, BOARD_WORD, light=True)},
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
JSON_OUT.write_text(json.dumps(spec, indent=2) + '\n')
print('lockups', json.dumps(spec['lockups'], indent=1))
print('maskable', spec['maskableScale'], 'bbox', spec['bbox'])
