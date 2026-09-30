import sharp from 'sharp'
import fs from 'node:fs'
const R = '/home/user/Cardi-Golf/public'
const favicon = fs.readFileSync(`${R}/favicon.svg`)
const icon = fs.readFileSync(`${R}/icons/icon-512.png`)
const mask = fs.readFileSync(`${R}/icons/icon-maskable-512.png`)
const apple = fs.readFileSync(`${R}/apple-touch-icon.png`)
async function r(buf, s, circle=false) {
  let b = await sharp(buf, { density: 600 }).resize(s, s, { kernel: 'lanczos3' }).png().toBuffer()
  if (circle) b = await sharp(b).composite([{ input: Buffer.from(`<svg width="${s}" height="${s}"><circle cx="${s/2}" cy="${s/2}" r="${s/2}" fill="#fff"/></svg>`), blend: 'dest-in' }]).png().toBuffer()
  return b
}
// Panel 1: tab strip mock at 1x then upscale 4x: favicon 16 on light (#f1f3f4) and dark (#35363a) Chrome tab colors
const W1 = 200, H1 = 60
const comps = []
comps.push({ input: { create: { width: 100, height: H1, channels: 4, background: '#dee1e6' } }, left: 0, top: 0 })
comps.push({ input: { create: { width: 100, height: H1, channels: 4, background: '#35363a' } }, left: 100, top: 0 })
for (const [x, bg] of [[10,'l'],[110,'d']]) {
  comps.push({ input: await r(favicon, 16), left: x, top: 8 })
  comps.push({ input: await r(favicon, 32), left: x + 24, top: 8 })
  comps.push({ input: await r(icon, 16), left: x, top: 44 - 8 })
  comps.push({ input: await r(icon, 32), left: x + 24, top: 44 - 18 })
  comps.push({ input: await r(mask, 32, true), left: x + 62, top: 20 })
}
const p1 = await sharp({ create: { width: W1, height: H1, channels: 4, background: '#fff' } }).composite(comps).png().toBuffer()
await sharp(p1).resize(W1*4, H1*4, { kernel: 'nearest' }).toFile(process.argv[2] + '-tabs.png')
// Panel 2: home screen mock: 180 (iOS 60pt @3x), 192 android circle, on a dark wallpaper and a light wallpaper, with reference solid squares
const W2 = 900, H2 = 480
const c2 = []
c2.push({ input: { create: { width: 450, height: H2, channels: 4, background: '#1a2a3a' } }, left: 0, top: 0 })
c2.push({ input: { create: { width: 450, height: H2, channels: 4, background: '#e8e4dc' } }, left: 450, top: 0 })
for (const x0 of [0, 450]) {
  const ios = await sharp(apple).composite([{ input: Buffer.from(`<svg width="180" height="180"><rect width="180" height="180" rx="40" fill="#fff"/></svg>`), blend: 'dest-in' }]).png().toBuffer()
  c2.push({ input: ios, left: x0 + 30, top: 30 })
  c2.push({ input: await r(mask, 192, true), left: x0 + 230, top: 24 })
  c2.push({ input: await r(icon, 120), left: x0 + 30, top: 260 })
  c2.push({ input: await r(mask, 120, true), left: x0 + 180, top: 260 })
  c2.push({ input: await r(favicon, 64), left: x0 + 330, top: 280 })
}
await sharp({ create: { width: W2, height: H2, channels: 4, background: '#fff' } }).composite(c2).png().toFile(process.argv[2] + '-home.png')
console.log('ok')
