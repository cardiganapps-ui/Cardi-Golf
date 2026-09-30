import sharp from 'sharp'
import { readFileSync } from 'node:fs'
const OUT = '/home/user/Cardi-Golf/docs/review/2026-09-30/shots/'
const seen = new Set(JSON.parse(readFileSync('viewed.json', 'utf8')))
const all = readFileSync('myfiles.txt', 'utf8').trim().split('\n').map((f) => f.split('/').pop())
const todo = all.filter((f) => !seen.has(f) && /laptop/.test(f) && !/-full\.png$/.test(f))
const W = 720, H = 450
let n = 0
for (let i = 0; i < todo.length; i += 6) {
  const batch = todo.slice(i, i + 6)
  const comps = []
  for (let j = 0; j < batch.length; j++) {
    const img = await sharp(OUT + batch[j]).resize({ width: W, height: H, fit: 'cover', position: 'top' }).toBuffer()
    const label = Buffer.from(`<svg width="${W}" height="22"><rect width="${W}" height="22" fill="#000"/><text x="6" y="16" font-size="14" fill="#ff0" font-family="monospace">${batch[j].replace('-light', '')}</text></svg>`)
    comps.push({ input: img, left: (j % 2) * W, top: Math.floor(j / 2) * (H + 22) + 22 }, { input: label, left: (j % 2) * W, top: Math.floor(j / 2) * (H + 22) })
  }
  await sharp({ create: { width: 2 * W, height: 3 * (H + 22), channels: 3, background: '#444' } }).composite(comps).png().toFile(`sheets/sheet${String(++n).padStart(2, '0')}.png`)
  console.log(`sheet${n}: ${batch.join(', ')}`)
}
