// Generates the platform's PWA icons and favicon from the Polo symbol: a
// cursive P drawn in one pencil line, on card stock. The drawing lives in
// src/design/logoMark.json (shared with the in-app LogoMark); colors are read
// from src/styles/tokens.css, never typed here.
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

/**
 * The symbol on its 100×100 grid, scaled into a square icon on card stock.
 * `padding` keeps a maskable icon inside the Android safe zone.
 */
function mark(size, { padding = 0, rounded = true } = {}) {
  const k = (size - padding * 2) / 100
  const passes = G.passes
    .map(
      (q) =>
        `<path d="${G.d}" transform="translate(${q.dx} ${q.dy})" fill="none" stroke="${INK}" stroke-width="${q.width}" stroke-opacity="${q.opacity}" stroke-linecap="round" stroke-linejoin="round"/>`,
    )
    .join('\n    ')
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${rounded ? (size * 0.22).toFixed(1) : 0}" fill="${BG}"/>
  <g transform="translate(${padding} ${padding}) scale(${k.toFixed(4)})">
    ${passes}
  </g>
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
