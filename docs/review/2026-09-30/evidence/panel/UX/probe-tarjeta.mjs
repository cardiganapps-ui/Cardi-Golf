import { launch, phone, BASE, measureTargets, saveJson, shot, sleep } from './lib.mjs'
const b = await launch()
const ctx = await phone(b, { blockSupabase: true })
const p = await ctx.newPage()
const errors = []
p.on('pageerror', (e) => errors.push(String(e)))
await p.goto(`${BASE}/t/_/full12-live/tarjeta`, { waitUntil: 'networkidle' })
await sleep(800)
console.log('url', p.url())
const txt = await p.evaluate(() => document.body.innerText.slice(0, 1500))
console.log(txt)
const targets = await measureTargets(p)
saveJson('targets-tarjeta-full12-live', targets)
const small = targets.filter((t) => t.small)
console.log('targets', targets.length, 'small', small.length)
for (const t of small) console.log(JSON.stringify(t))
const vh = await p.evaluate(() => ({ sh: document.documentElement.scrollHeight, ih: innerHeight }))
console.log('scrollHeight', vh)
// Where is the save button and the tab bar?
for (const sel of ['text=Guardar hoyo', 'nav']) {
  const bb = await p.locator(sel).first().boundingBox().catch(() => null)
  console.log(sel, JSON.stringify(bb))
}
await shot(p, 't_tarjeta-full12-live-15pro-light-ux-hole.png')
console.log('errors', errors)
await b.close()
