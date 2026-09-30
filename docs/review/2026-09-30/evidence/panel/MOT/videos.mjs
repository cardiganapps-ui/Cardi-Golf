// Short Playwright videos of the key motions (evidence only).
import { launch, ctx, BASE } from './lib.mjs'
import { renameSync } from 'node:fs'
const DEVBASE = process.env.DEVBASE || 'http://127.0.0.1:4196'
const b = await launch()
async function rec(name, device, fn) {
  const c = await ctx(b, device, { recordVideo: { dir: 'video', size: device === 'tv' || device === 'laptop' ? { width: 960, height: 540 } : { width: 393, height: 852 } } })
  const p = await c.newPage()
  await fn(p)
  const v = p.video(); await c.close(); renameSync(await v.path(), `video/${name}.webm`)
  console.log('saved', name)
}
await rec('envivo-resort-toggle', '15pro', async (p) => { await p.goto(BASE + '/t/_/full12-live', { waitUntil: 'networkidle' }); await p.waitForTimeout(800); await p.getByRole('radio', { name: 'Gross' }).click(); await p.waitForTimeout(900); await p.getByRole('radio', { name: 'Puntos' }).click(); await p.waitForTimeout(900) })
await rec('tarjeta-guardar-hoyo', '15pro', async (p) => { await p.goto(BASE + '/t/_/full12-live/tarjeta', { waitUntil: 'networkidle' }); await p.waitForTimeout(800); await p.getByRole('button', { name: /^Guardar hoyo/ }).click(); await p.waitForTimeout(1500); await p.getByRole('button', { name: /^Guardar hoyo/ }).click(); await p.waitForTimeout(1500) })
await rec('ceremonia-steps', 'laptop', async (p) => { await p.goto(BASE + '/t/_/full12-finished/ceremonia', { waitUntil: 'networkidle' }); await p.waitForTimeout(800); await p.getByRole('button', { name: 'Empezar la ceremonia' }).click(); await p.waitForTimeout(1200); await p.getByRole('button', { name: 'Revelar' }).click(); await p.waitForTimeout(1000); await p.getByRole('button', { name: 'Siguiente' }).click(); await p.waitForTimeout(1200) })
await rec('player-sheet-open-close', '15pro', async (p) => { await p.goto(BASE + '/t/_/full12-live', { waitUntil: 'networkidle' }); await p.waitForTimeout(800); await p.locator('button[aria-label]').filter({ hasText: 'Leonel' }).first().click(); await p.waitForTimeout(900); await p.keyboard.press('Escape'); await p.waitForTimeout(700) })
await rec('tv-auction-hammer-dev', 'tv', async (p) => {
  await p.goto(DEVBASE + '/t/_/full12-live/tv', { waitUntil: 'networkidle' }); await p.waitForTimeout(1500)
  await p.evaluate(async () => { const m = await import('/src/data/tournamentStore.ts'); window.__s = m.useTournament; window.__s.getState().patch((s) => { s.tournament.status = 'auction'; s.scores = []; s.calcuttaBuybacks = []; s.calcuttaLots.sort((a, b) => a.lotNumber - b.lotNumber); s.calcuttaLots.forEach((l, i) => { if (i >= 7) { l.status = i === 7 ? 'open' : 'pending'; l.price = null; l.ownerId = null; l.soldAt = null } }); s.calcuttaBids = s.calcuttaBids.filter((bd) => s.calcuttaLots.findIndex((l) => l.id === bd.lotId) < 7) }) })
  await p.waitForTimeout(1200)
  await p.evaluate(() => window.__s.getState().patch((s) => { const o = s.calcuttaLots.find((l) => l.status === 'open'); s.calcuttaBids.push({ id: 'v1', lotId: o.id, bidderId: s.players.find((x) => x.id !== o.playerId).id, amount: 1500, createdAt: '2027-04-08T21:00:00Z' }) }))
  await p.waitForTimeout(1200)
  await p.evaluate(() => window.__s.getState().patch((s) => { const o = s.calcuttaLots.find((l) => l.status === 'open'); o.status = 'sold'; o.price = 1500; o.ownerId = s.players.find((x) => x.id !== o.playerId).id; o.soldAt = '2027-04-08T21:01:00Z' }))
  await p.waitForTimeout(1800)
})
await b.close()
