// Generates the platform's PWA icons, favicon and the in-app symbol images from
// the Polo logo as lifted off the approved sheet (design/brand/polo-logo-sheet.jpg)
// by scripts/brand/extract-logo.py: the pencil layers in design/brand/layer-*.png
// (the sheet's own pixels, separated from its paper) and the outline and
// geometry in src/design/logoMark.json. Paper and favicon ink are read from
// src/styles/tokens.css, never typed here.
// Run: npm run icons  (output is committed under public/)
// A tournament's logo is NOT the app icon: brands are per tournament.
import sharp from 'sharp'
import { mkdir, readFile, writeFile } from 'node:fs/promises'

const tokens = await readFile('src/styles/tokens.css', 'utf8')
const token = (name) => {
  const m = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(tokens)
  if (!m) throw new Error(`token --${name} not found`)
  return m[1]
}
const BG = token('bg')
const INK = token('ink')
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

await mkdir('public/icons', { recursive: true })
await mkdir('public/brand', { recursive: true })
await icon('public/icons/icon-192.png', 192)
await icon('public/icons/icon-512.png', 512)
// Maskable: Android crops to a circle; logoMark.json says how far to shrink.
await icon('public/icons/icon-maskable-512.png', 512, { rounded: false, scale: G.maskableScale })
await icon('public/apple-touch-icon.png', 180, { rounded: false })
await markImage('public/brand/polo-mark.png', 'design/brand/layer-lockup.png')
await markImage('public/brand/polo-mark-board.png', 'design/brand/layer-board.png')
await writeFile('public/favicon.svg', favicon())
console.log('wrote public/favicon.svg')
