// Generates the platform's PWA icons from an SVG wordmark, and a favicon.
// Run: npm run icons  (output is committed under public/)
// The tournament logo (assets/nacho-logo.png) is NOT the app icon: brands are
// per tournament (CLAUDE.md §0.5, §14); the shell carries the platform mark.
import sharp from 'sharp'
import { mkdir, writeFile } from 'node:fs/promises'

const TEAL = '#0F6E77'
const DEEP = '#0B4F57'
const SUN = '#F2B63F'
const PAPER = '#F7F1E3'

/** A flag on a green with a wave: simple, legible at 48px, no text. */
function mark(size, { padding = 0, bg = TEAL } = {}) {
  const inner = size - padding * 2
  const s = inner / 100 // scale from a 100×100 design grid
  const t = (n) => (padding + n * s).toFixed(2)
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${(size * 0.22).toFixed(1)}" fill="${bg}"/>
  <!-- sand horizon -->
  <path d="M${t(0)} ${t(72)} C ${t(18)} ${t(64)}, ${t(32)} ${t(80)}, ${t(50)} ${t(72)} S ${t(82)} ${t(64)}, ${t(100)} ${t(72)} L ${t(100)} ${t(100)} L ${t(0)} ${t(100)} Z" fill="${DEEP}"/>
  <!-- wave line -->
  <path d="M${t(8)} ${t(84)} C ${t(20)} ${t(78)}, ${t(30)} ${t(90)}, ${t(42)} ${t(84)} S ${t(64)} ${t(78)}, ${t(76)} ${t(84)} S ${t(88)} ${t(90)}, ${t(94)} ${t(86)}" stroke="${SUN}" stroke-width="${(3.2 * s).toFixed(2)}" fill="none" stroke-linecap="round"/>
  <!-- pin -->
  <rect x="${t(47.5)}" y="${t(18)}" width="${(5 * s).toFixed(2)}" height="${(56 * s).toFixed(2)}" rx="${(2.5 * s).toFixed(2)}" fill="${PAPER}"/>
  <path d="M${t(52.5)} ${t(18)} L ${t(82)} ${t(30)} L ${t(52.5)} ${t(42)} Z" fill="${SUN}"/>
  <!-- ball -->
  <circle cx="${t(36)}" cy="${t(74)}" r="${(5.5 * s).toFixed(2)}" fill="${PAPER}"/>
</svg>`
}

await mkdir('public/icons', { recursive: true })

const jobs = [
  ['public/icons/icon-192.png', 192, {}],
  ['public/icons/icon-512.png', 512, {}],
  // Maskable: keep the artwork inside the 80% safe zone.
  ['public/icons/icon-maskable-512.png', 512, { padding: 56 }],
  ['public/apple-touch-icon.png', 180, {}],
]
for (const [file, size, opts] of jobs) {
  await sharp(Buffer.from(mark(size, opts))).png().toFile(file)
  console.log('wrote', file)
}
await writeFile('public/favicon.svg', mark(64))
console.log('wrote public/favicon.svg')
