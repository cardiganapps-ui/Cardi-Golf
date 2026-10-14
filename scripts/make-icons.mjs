// Generates the platform's PWA icons, favicon, iPhone launch images and the in-app
// symbol images from the Polo logo as lifted off the approved sheet
// (design/brand/polo-logo-sheet.jpg) by scripts/brand/extract-logo.py: the pencil
// layers in design/brand/layer-*.png (the sheet's own pixels, separated from its
// paper) and the outline and geometry in src/design/logoMark.json. Paper and ink
// are read from src/styles/tokens.css, never typed here.
// Run: npm run icons  (output is committed under public/)
// A tournament's logo is NOT the app icon: brands are per tournament.
import sharp from 'sharp'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { LAUNCH_MARK_PX, LAUNCH_SCREENS, launchImagePath, launchPixels } from '../src/lib/launchImages.ts'

const tokens = await readFile('src/styles/tokens.css', 'utf8')
const token = (name) => {
  const m = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(tokens)
  if (!m) throw new Error(`token --${name} not found`)
  return m[1]
}
const BG = token('bg')
const INK = token('ink')
// White, as text on the accent is: the notification badge's only colour.
const BADGE = token('accent-ink')
const G = JSON.parse(await readFile('src/design/logoMark.json', 'utf8'))

/** An app icon: the sheet's tile, its pencil layer on card stock. */
async function icon(file, size, { rounded = true, scale = 1 } = {}) {
  const r = rounded ? (size * G.tileRadius).toFixed(1) : 0
  const paper = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${r}" fill="${BG}"/></svg>`,
  )
  const inner = Math.round(size * scale)
  const off = Math.round((size - inner) / 2)
  const pencil = await sharp('design/brand/layer-icon.png').resize(inner, inner, { kernel: 'lanczos3' }).png().toBuffer()
  await sharp(paper).composite([{ input: pencil, left: off, top: off }]).png().toFile(file)
  console.log('wrote', file)
}

/** A lockup's symbol for the app: its layer, at 3x the sheet (plenty for a 3x screen). */
async function markImage(file, layer) {
  const { width, height } = await sharp(layer).metadata()
  const w = Math.round((width * 3) / 4)
  const h = Math.round((height * 3) / 4)
  await sharp(layer).resize(w, h, { kernel: 'lanczos3' }).png({ compressionLevel: 9 }).toFile(file)
  console.log('wrote', file, `${w}x${h}`)
}

/**
 * An iPhone launch image (PWA-14, src/lib/launchImages.ts): the page's paper, and the icon's pencil in the
 * middle at the size the boot screen shows the icon (LAUNCH_MARK_PX), so the two read as one. A palette
 * PNG: a flat page and one mark.
 */
async function launchImage(screen) {
  const { width, height } = launchPixels(screen)
  const tile = LAUNCH_MARK_PX * screen.ratio
  const pencil = await sharp('design/brand/layer-icon.png').resize(tile, tile, { kernel: 'lanczos3' }).png().toBuffer()
  const file = `public${launchImagePath(screen)}`
  await sharp({ create: { width, height, channels: 3, background: BG } })
    .composite([{ input: pencil, left: Math.round((width - tile) / 2), top: Math.round((height - tile) / 2) }])
    .png({ palette: true, colors: 64, compressionLevel: 9 })
    .toFile(file)
  console.log('wrote', file)
}

/**
 * The boot screen's mark (index.html, until the app mounts): the launch images' own, on the same paper, at
 * three times LAUNCH_MARK_PX, so the launch image, the boot screen and the app read as one (PWA-14).
 */
async function bootMark(file) {
  const tile = LAUNCH_MARK_PX * 3
  const pencil = await sharp('design/brand/layer-icon.png').resize(tile, tile, { kernel: 'lanczos3' }).png().toBuffer()
  await sharp({ create: { width: tile, height: tile, channels: 3, background: BG } })
    .composite([{ input: pencil, left: 0, top: 0 }])
    .png({ palette: true, colors: 64, compressionLevel: 9 })
    .toFile(file)
  console.log('wrote', file)
}

/**
 * A shortcut's icon (the manifest's «Mi tarjeta» and «En vivo», PWA-14): its tab's glyph in ink on the
 * paper, in the middle half, since Android crops shortcut icons to its own shape as it does the maskable
 * icon. `paths` are the glyph's, as src/components/icons.tsx draws it (24-px grid, 1.75 stroke).
 */
async function shortcutIcon(file, paths) {
  const size = 192
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24">
  <rect width="24" height="24" fill="${BG}"/>
  <g transform="translate(6 6) scale(0.5)" fill="none" stroke="${INK}" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${paths.map((d) => `<path d="${d}"/>`).join('')}</g>
</svg>`
  await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(file)
  console.log('wrote', file)
}

/** Favicon: the icon copy's outline in solid ink, enlarged in its tile so it reads at 16 px. */
function favicon() {
  const size = 64
  const k = (size * 0.86) / G.bbox.h
  const tx = (size - G.bbox.w * k) / 2 - G.bbox.x * k
  const ty = (size - G.bbox.h * k) / 2 - G.bbox.y * k
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${(size * G.tileRadius).toFixed(1)}" fill="${BG}"/>
  <path d="${G.d}" fill-rule="${G.fillRule}" fill="${INK}" transform="translate(${tx.toFixed(3)} ${ty.toFixed(3)}) scale(${k.toFixed(5)})"/>
</svg>
`
}

/**
 * The notification badge (public/push-sw.js, PWA-12): Android draws it from its alpha alone, tinted by the
 * system, so the icon copy's outline on transparent, no tile (the opaque icon read as a white square). It fills
 * the 20 of 24 dp a status-bar icon keeps clear of its edge, its pencil line thickened by `line` px so it still
 * reads at 24 dp.
 */
async function badge(file, size, line = 2) {
  const k = ((size - line) * (20 / 24)) / Math.max(G.bbox.w, G.bbox.h)
  const tx = (size - G.bbox.w * k) / 2 - G.bbox.x * k
  const ty = (size - G.bbox.h * k) / 2 - G.bbox.y * k
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><path d="${G.d}" fill-rule="${G.fillRule}" fill="${BADGE}" stroke="${BADGE}" stroke-width="${(line / k).toFixed(4)}" stroke-linejoin="round" transform="translate(${tx.toFixed(3)} ${ty.toFixed(3)}) scale(${k.toFixed(5)})"/></svg>`
  await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(file)
  console.log('wrote', file)
}

await mkdir('public/icons', { recursive: true })
await mkdir('public/brand', { recursive: true })
await mkdir('public/splash', { recursive: true })
await icon('public/icons/icon-192.png', 192)
await icon('public/icons/icon-512.png', 512)
// Maskable: Android crops to a circle; logoMark.json says how far to shrink.
await icon('public/icons/icon-maskable-512.png', 512, { rounded: false, scale: G.maskableScale })
await icon('public/apple-touch-icon.png', 180, { rounded: false })
await badge('public/icons/badge-96.png', 96)
await markImage('public/brand/polo-mark.png', 'design/brand/layer-lockup.png')
await markImage('public/brand/polo-mark-board.png', 'design/brand/layer-board.png')
await writeFile('public/favicon.svg', favicon())
console.log('wrote public/favicon.svg')
for (const screen of LAUNCH_SCREENS) await launchImage(screen)
await bootMark('public/brand/boot-mark.png')
// IconPencil and IconFlag (src/components/icons.tsx): the Tarjeta's tab and En vivo's.
await shortcutIcon('public/icons/shortcut-tarjeta.png', ['M4 20l4-1 10.5-10.5a2.1 2.1 0 0 0-3-3L5 16l-1 4z', 'M13.5 7.5l3 3'])
await shortcutIcon('public/icons/shortcut-envivo.png', ['M6 21V4', 'M6 4h10l-2.5 3.5L16 11H6'])
