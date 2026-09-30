#!/usr/bin/env node
// Contact sheet for review: node sheet.mjs out.png w1 file1 file2 ...   (each scaled to width w1 px, side by side, labelled)
// A tall image (h > 2.2 × w) is split into columns of height ≤ 2.2 × w... unless --nosplit.
import sharp from 'sharp'
const [out, w0, ...files] = process.argv.slice(2)
const W = Number(w0)
const parts = []
for (const f of files) {
  const img = sharp(f)
  const m = await img.metadata()
  const scale = W / m.width
  const h = Math.round(m.height * scale)
  const buf = await sharp(f).resize({ width: W }).png().toBuffer()
  const maxH = Math.round(W * 2.2)
  if (h > maxH * 1.15) {
    for (let y = 0; y < h; y += maxH) {
      const hh = Math.min(maxH, h - y)
      parts.push({ buf: await sharp(buf).extract({ left: 0, top: y, width: W, height: hh }).toBuffer(), w: W, h: hh, label: `${f.split('/').pop()} [${y}-${y + hh}]` })
    }
  } else parts.push({ buf, w: W, h, label: f.split('/').pop() })
}
const LABEL = 18
const gap = 8
const H = Math.max(...parts.map((p) => p.h)) + LABEL
const totalW = parts.reduce((a, p) => a + p.w + gap, 0)
const comps = []
let x = 0
for (const p of parts) {
  const svg = Buffer.from(`<svg width="${p.w}" height="${LABEL}"><rect width="100%" height="100%" fill="#222"/><text x="3" y="13" font-size="11" font-family="monospace" fill="#fff">${p.label.replace(/&/g, '&amp;').replace(/</g, '&lt;').slice(0, Math.floor(p.w / 6.6))}</text></svg>`)
  comps.push({ input: svg, left: x, top: 0 })
  comps.push({ input: p.buf, left: x, top: LABEL })
  x += p.w + gap
}
await sharp({ create: { width: totalW, height: H, channels: 3, background: '#888' } }).composite(comps).png().toFile(out)
console.log(out, totalW, 'x', H)
