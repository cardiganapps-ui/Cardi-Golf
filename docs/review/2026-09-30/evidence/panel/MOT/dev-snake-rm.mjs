// Dev server: open Juegos > La Víbora, then a synthetic 3-putt by another player on the group's last hole -> holder changes.
import { launch, ctx } from './lib.mjs'
const DEVBASE = process.env.DEVBASE || 'http://127.0.0.1:4196'
const b = await launch()
const c = await ctx(b, '15pro', { reducedMotion: process.env.RM || 'no-preference' })
const p = await c.newPage()
await p.goto(DEVBASE + '/t/_/full12-live/juegos', { waitUntil: 'networkidle' })
await p.waitForTimeout(1500)
await p.getByRole('button', { name: /Víbora/ }).first().click()
await p.waitForTimeout(800)
const info = await p.evaluate(async () => {
  const m = await import('/src/data/tournamentStore.ts'); window.__store = m.useTournament
  const d = m.useTournament.getState().data
  const g = d.state.modules.snake.groups.find((x) => x.roundId === 'r2' && x.holderId && !x.pendingHole)
  const holder = g.holderId
  const other = g.playerIds.find((x) => x !== holder)
  const played = d.snapshot.scores.filter((s) => s.roundId === 'r2' && s.playerId === other && s.strokes != null).map((s) => s.hole)
  const hole = Math.max(...played)
  return { group: g.groupNumber, groupId: g.groupId, holder, other, hole }
})
console.log('before', JSON.stringify(info))
await p.evaluate(() => { window.__sn = []; const t0 = performance.now(); const f = () => { const grp = [...document.querySelectorAll('[class*="group_"]')].find((g) => /Grupo 2/.test(g.querySelector('strong')?.textContent || '') && g.closest('section')?.querySelector('h3')?.textContent?.includes('2')); const el = grp?.querySelector('[class*="snake_"]'); const r = el?.getBoundingClientRect(); window.__sn.push([Math.round(performance.now() - t0), r ? Math.round(r.left) : null, r ? Math.round(r.top) : null, el ? getComputedStyle(el).transform : null]); if (performance.now() - t0 < 1000) requestAnimationFrame(f) }; requestAnimationFrame(f) })
await p.evaluate(({ other, hole }) => window.__store.getState().patch((s) => { for (const sc of s.scores) if (sc.roundId === 'r2' && sc.playerId === other && sc.hole === hole) { sc.putts = 3; if ((sc.strokes ?? 0) < 4) sc.strokes = 5 } }), info)
await p.waitForTimeout(120); await p.screenshot({ path: 'shots/snake-120ms.png' })
await p.waitForTimeout(1000)
const tr = await p.evaluate(() => window.__sn)
const after = await p.evaluate((gid) => window.__store.getState().data.state.modules.snake.groups.find((x) => x.groupId === gid).holderId, info.groupId)
const moving = tr.filter((x, i) => i > 0 && (x[1] !== tr[i - 1][1] || x[2] !== tr[i - 1][2]))
console.log('holder after', after, '| first-el positions (left,top) over time:', JSON.stringify(tr.filter((x, i) => i === 0 || x[1] !== tr[i - 1][1]).map((x) => [x[0], x[1], x[2]])))
console.log('moving frames', moving.length, moving.length ? `${moving[0][0]}..${moving[moving.length - 1][0]}ms` : '')
await p.screenshot({ path: 'shots/snake-after.png' })
await b.close()
