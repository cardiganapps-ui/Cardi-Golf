// Dev server (:4190, same source): a synthetic 'realtime' change while En vivo is open, via the real store's patch().
import { launch, ctx, load } from './lib.mjs'
import { writeFileSync, mkdirSync } from 'node:fs'
const DEVBASE = process.env.DEVBASE || 'http://127.0.0.1:4196'
const SHOTS = '/home/user/Cardi-Golf/docs/review/2026-09-30/shots'
mkdirSync('shots', { recursive: true })
const b = await launch()
const c = await ctx(b, '15pro')
const p = await c.newPage()
p.on('pageerror', (e) => console.log('pageerror', e.message))
await p.goto(DEVBASE + '/t/_/full12-live', { waitUntil: 'networkidle' })
await p.waitForSelector('button[aria-label]', { timeout: 30000 })
await p.waitForTimeout(1500)
const before = await p.evaluate(async () => {
  const m = await import('/src/data/tournamentStore.ts')
  window.__store = m.useTournament
  const rows = m.useTournament.getState().data.state.modules.individual.rows
  return rows.map((r) => r.playerId + ':' + r.label + ':' + r.total)
})
console.log('before', before.join(' '))
// arrows watcher
await p.evaluate(() => { window.__arr = []; const t0 = performance.now(); const f = () => { const n = document.querySelectorAll('[class*="moved"]').length; window.__arr.push([Math.round(performance.now() - t0), n]); if (performance.now() - t0 < 2000) requestAnimationFrame(f) }; requestAnimationFrame(f) })
// Boost the last-placed player: day-2 strokes on his played holes -> par - 2
const last = before[before.length - 1].split(':')[0]
await p.evaluate((pid) => {
  window.__store.getState().patch((s) => { for (const sc of s.scores) if (sc.roundId === 'r2' && sc.playerId === pid && sc.strokes != null) { sc.strokes = 2; sc.pickedUp = false } })
}, last)
const t = Date.now()
await p.waitForTimeout(90); await p.screenshot({ path: 'shots/arrows-100ms.png' })
await p.waitForTimeout(250); await p.screenshot({ path: 'shots/arrows-350ms.png' })
await p.waitForTimeout(350); await p.screenshot({ path: 'shots/arrows-700ms.png' })
await p.waitForTimeout(800); await p.screenshot({ path: 'shots/arrows-1500ms.png' })
const arr = await p.evaluate(() => window.__arr)
const withArrows = arr.filter((x) => x[1] > 0)
console.log('arrow frames', withArrows.length, 'visible from', withArrows[0]?.[0], 'to', withArrows[withArrows.length - 1]?.[0], 'ms; max count', Math.max(...arr.map((x) => x[1])))
const after = await p.evaluate(() => window.__store.getState().data.state.modules.individual.rows.map((r) => r.playerId + ':' + r.label + ':' + r.total))
console.log('after', after.join(' '))
// go to Juegos and back (client-side), then apply another change while away and come back
await p.getByRole('link', { name: 'Tarjeta' }).click(); await p.waitForTimeout(800)
await p.evaluate((pid) => { window.__store.getState().patch((s) => { for (const sc of s.scores) if (sc.roundId === 'r2' && sc.playerId === pid && sc.strokes != null) sc.strokes = 9 }) }, last)
await p.getByRole('link', { name: 'En vivo' }).click()
await p.evaluate(() => { window.__arr = []; const t0 = performance.now(); const f = () => { const n = document.querySelectorAll('[class*="moved"]').length; window.__arr.push([Math.round(performance.now() - t0), n]); if (performance.now() - t0 < 1500) requestAnimationFrame(f) }; requestAnimationFrame(f) })
await p.waitForTimeout(1600)
const arr2 = await p.evaluate(() => window.__arr)
console.log('after returning to En vivo (player fell back to last while away): arrow frames', arr2.filter((x) => x[1] > 0).length)
await p.screenshot({ path: 'shots/arrows-after-return.png' })
await b.close()
