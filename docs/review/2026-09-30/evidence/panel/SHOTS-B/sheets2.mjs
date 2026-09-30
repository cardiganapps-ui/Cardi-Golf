import sharp from 'sharp'
const OUT = '/home/user/Cardi-Golf/docs/review/2026-09-30/shots/'
const list = [
  ...[2, 3, 4, 5].map((n) => `t_tv-full12-finished-tv-dark-slide${n}.png`),
  ...[3, 4, 5, 6, 7].map((n) => `t_tv-large60-tv-dark-slide${n}.png`),
  ...[3, 5].map((n) => `t_tv-longnames-tv-dark-slide${n}.png`),
  ...[4, 5, 6, 8, 9, 10, 11, 12, 14, 15, 16, 17, 18, 19, 20, 22, 24].map((n) => `t_ceremonia-full12-finished-tv-dark-step${String(n).padStart(2, '0')}.png`),
]
const W = 720, H = 405
let n = 0
for (let i = 0; i < list.length; i += 6) {
  const batch = list.slice(i, i + 6)
  const comps = []
  for (let j = 0; j < batch.length; j++) {
    const img = await sharp(OUT + batch[j]).resize({ width: W, height: H }).toBuffer()
    const label = Buffer.from(`<svg width="${W}" height="22"><rect width="${W}" height="22" fill="#000"/><text x="6" y="16" font-size="14" fill="#ff0" font-family="monospace">${batch[j]}</text></svg>`)
    comps.push({ input: img, left: (j % 2) * W, top: Math.floor(j / 2) * (H + 22) + 22 }, { input: label, left: (j % 2) * W, top: Math.floor(j / 2) * (H + 22) })
  }
  await sharp({ create: { width: 2 * W, height: 3 * (H + 22), channels: 3, background: '#444' } }).composite(comps).png().toFile(`sheets/tv${String(++n).padStart(2, '0')}.png`)
  console.log(`tv${n}: ${batch.join(', ')}`)
}
