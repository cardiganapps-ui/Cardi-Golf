// Generates the platform's PWA icons and favicon from the wordmark's mark:
// a constructed "P" with the pencil ring (the notation for a birdie), on
// card stock. Colors are read from src/styles/tokens.css, never typed here.
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
const RING = token('under')

/**
 * The mark on a 100×100 grid: a geometric P (stroke 13) and a thin ring
 * rotated a few degrees, like a pencil circle around a score.
 */
function mark(size, { padding = 0, rounded = true } = {}) {
  const inner = size - padding * 2
  const k = inner / 100
  const p = (n) => (padding + n * k).toFixed(2)
  // Stem at x 36.5 from the baseline up; the bowl is a half circle of radius 14.5.
  const x = 36.5
  const top = 30.5
  const r = 14.5
  const g = [
    `M${p(x)} ${p(80)}`,
    `L${p(x)} ${p(top)}`,
    `L${p(52)} ${p(top)}`,
    `A${(r * k).toFixed(2)} ${(r * k).toFixed(2)} 0 0 1 ${p(52)} ${p(top + 2 * r)}`,
    `L${p(x)} ${p(top + 2 * r)}`,
  ].join(' ')
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${rounded ? (size * 0.22).toFixed(1) : 0}" fill="${BG}"/>
  <path d="${g}" fill="none" stroke="${INK}" stroke-width="${(13 * k).toFixed(2)}" stroke-linecap="butt" stroke-linejoin="miter"/>
  <ellipse cx="${p(51)}" cy="${p(51)}" rx="${(41 * k).toFixed(2)}" ry="${(38 * k).toFixed(2)}" transform="rotate(-8 ${p(51)} ${p(51)})" fill="none" stroke="${RING}" stroke-width="${(3.2 * k).toFixed(2)}"/>
</svg>`
}

await mkdir('public/icons', { recursive: true })
const jobs = [
  ['public/icons/icon-192.png', 192, {}],
  ['public/icons/icon-512.png', 512, {}],
  // Maskable: keep the artwork inside the 80% safe zone.
  ['public/icons/icon-maskable-512.png', 512, { padding: 56, rounded: false }],
  ['public/apple-touch-icon.png', 180, { rounded: false }],
]
for (const [file, size, opts] of jobs) {
  await sharp(Buffer.from(mark(size, opts))).png().toFile(file)
  console.log('wrote', file)
}
await writeFile('public/favicon.svg', mark(64))
console.log('wrote public/favicon.svg')
