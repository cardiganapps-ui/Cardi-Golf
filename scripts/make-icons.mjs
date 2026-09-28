// Generates the platform's PWA icons, favicon and the in-app symbol images from
// the Polo symbol as traced off the approved sheet (design/brand/polo-logo-sheet.jpg):
// the outline in src/design/logoMark.json and the sheet's own pencil texture in
// design/brand/logo-graphite.png and logo-gold.png, all three written by
// scripts/brand/extract-logo.py. The outline cuts the texture, so edges stay
// crisp at any size and the grain is the sheet's. Paper and favicon ink are
// read from src/styles/tokens.css, never typed here.
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
const GRAPHITE = 'design/brand/logo-graphite.png'
const GOLD = 'design/brand/logo-gold.png'

/** The outline as an SVG alpha mask: the whole tile at `size`, scaled about its centre. */
function outline(size, scale = 1) {
  const k = (size / G.tile) * scale
  const off = (size * (1 - scale)) / 2
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">` +
      `<path d="${G.d}" fill-rule="${G.fillRule}" fill="white" transform="translate(${off} ${off}) scale(${k})"/></svg>`,
  )
}

/** The symbol on a transparent tile of `size` px: the texture, cut by the outline. */
async function symbol(size, texture, scale = 1) {
  const inner = Math.round(size * scale)
  const off = Math.round((size - inner) / 2)
  const tex = await sharp(texture).resize(inner, inner, { kernel: 'lanczos3' }).png().toBuffer()
  const cut = await sharp(tex).composite([{ input: outline(inner), blend: 'dest-in' }]).png().toBuffer()
  return sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: cut, left: off, top: off }])
    .png()
    .toBuffer()
}

/** An app icon: the sheet's tile, i.e. the symbol where the sheet puts it, on card stock. */
async function icon(file, size, { rounded = true, scale = 1 } = {}) {
  const r = rounded ? (size * G.tileRadius).toFixed(1) : 0
  const paper = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${r}" fill="${BG}"/></svg>`,
  )
  await sharp(paper).composite([{ input: await symbol(size, GRAPHITE, scale) }]).png().toFile(file)
  console.log('wrote', file)
}

/** The symbol alone, cropped to its ink, for the app's lockup (transparent). */
async function markImage(file, texture, height) {
  const k = height / G.bbox.h
  const full = Math.round(G.tile * k)
  const tile = await symbol(full, texture)
  const box = {
    left: Math.floor(G.bbox.x * k),
    top: Math.floor(G.bbox.y * k),
    width: Math.ceil(G.bbox.w * k),
    height: Math.ceil(G.bbox.h * k),
  }
  await sharp(tile).extract(box).png({ palette: true, quality: 90, effort: 10 }).toFile(file)
  console.log('wrote', file, `${box.width}x${box.height}`)
}

/** Favicon: the same outline, solid ink and larger in its tile, so it reads at 16 px. */
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
await markImage('public/brand/polo-mark.png', GRAPHITE, 288)
await markImage('public/brand/polo-mark-board.png', GOLD, 288)
await writeFile('public/favicon.svg', favicon())
console.log('wrote public/favicon.svg')
