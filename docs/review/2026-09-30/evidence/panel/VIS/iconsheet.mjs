import sharp from 'sharp'
import fs from 'node:fs'
const R = '/home/user/Cardi-Golf/public'
const out = process.argv[2]
const sizes = [16, 32, 48, 180, 192, 512]
const srcs = [
  ['favicon.svg', `${R}/favicon.svg`],
  ['icon-512.png', `${R}/icons/icon-512.png`],
  ['maskable-512 (circle mask)', `${R}/icons/icon-maskable-512.png`],
  ['apple-touch-icon 180', `${R}/apple-touch-icon.png`],
]
const grounds = [['#ffffff','light'], ['#1c1c1e','dark']]
const pad = 20, gap = 16
const cols = sizes.reduce((a, s) => a + s + gap, 0) + pad*2
const rowH = 512 + 40
const W = cols, H = pad*2 + srcs.length * grounds.length * rowH
const comps = []
let y = pad
const labels = []
for (const [name, path] of srcs) {
  for (const [bg, gname] of grounds) {
    comps.push({ input: { create: { width: W, height: rowH, channels: 4, background: bg } }, left: 0, top: y })
    let x = pad
    for (const s of sizes) {
      let img = sharp(fs.readFileSync(path), { density: 600 }).resize(s, s, { kernel: 'lanczos3' })
      let buf = await img.png().toBuffer()
      if (name.startsWith('maskable')) {
        const mask = Buffer.from(`<svg width="${s}" height="${s}"><circle cx="${s/2}" cy="${s/2}" r="${s/2}" fill="#fff"/></svg>`)
        buf = await sharp(buf).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer()
      }
      comps.push({ input: buf, left: x, top: y + 30 })
      labels.push({ x, y: y + 22, t: `${s}px`, c: gname === 'dark' ? '#fff' : '#000' })
      x += s + gap
    }
    labels.push({ x: pad, y: y + 12, t: `${name} on ${gname}`, c: gname === 'dark' ? '#fff' : '#000' })
    y += rowH
  }
}
const svgText = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${labels.map(l => `<text x="${l.x}" y="${l.y}" font-family="sans-serif" font-size="13" fill="${l.c}">${l.t}</text>`).join('')}</svg>`
await sharp({ create: { width: W, height: H, channels: 4, background: '#888' } }).composite([...comps, { input: Buffer.from(svgText), left: 0, top: 0 }]).png().toFile(out)
console.log('wrote', out, W, H)
// Also: actual-pixel crops at 16/32/48 upscaled 8x (nearest) so the pixels are visible
const small = []
let xx = 10
for (const [name, path] of srcs.slice(0,2)) {
  for (const s of [16, 32, 48]) {
    const b = await sharp(fs.readFileSync(path), { density: 600 }).resize(s, s, { kernel: 'lanczos3' }).png().toBuffer()
    const up = await sharp(b).resize(s*6, s*6, { kernel: 'nearest' }).png().toBuffer()
    small.push({ input: up, left: xx, top: 10 }); xx += s*6 + 20
  }
}
await sharp({ create: { width: xx + 10, height: 48*6 + 20, channels: 4, background: '#ffffff' } }).composite(small).png().toFile(out.replace('.png', '-pixels.png'))
console.log('wrote pixels')
