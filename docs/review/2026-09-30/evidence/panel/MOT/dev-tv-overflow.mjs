import { launch, ctx } from './lib.mjs'
const DEVBASE = process.env.DEVBASE || 'http://127.0.0.1:4196'
const b = await launch()
for (const sold of [7, 8, 11]) {
  const c = await ctx(b, 'tv')
  const p = await c.newPage()
  await p.goto(DEVBASE + '/t/_/full12-live/tv', { waitUntil: 'networkidle' })
  await p.waitForTimeout(1500)
  await p.evaluate(async (n) => {
    const m = await import('/src/data/tournamentStore.ts'); window.__store = m.useTournament
    window.__store.getState().patch((s) => {
      s.tournament.status = 'auction'; s.scores = []; s.calcuttaBuybacks = []
      s.calcuttaLots.sort((a, b) => a.lotNumber - b.lotNumber)
      s.calcuttaLots.forEach((l, i) => { if (i >= n) { l.status = i === n ? 'open' : 'pending'; l.price = null; l.ownerId = null; l.soldAt = null } })
      s.calcuttaBids = s.calcuttaBids.filter((bd) => s.calcuttaLots.findIndex((l) => l.id === bd.lotId) < n)
    })
  }, sold)
  await p.waitForTimeout(800)
  const r = await p.evaluate(() => { const rows = [...document.querySelectorAll('[class*="soldRow"]')]; const last = rows[rows.length - 1]?.getBoundingClientRect(); return { rows: rows.length, lastTop: Math.round(last?.top ?? 0), lastBottom: Math.round(last?.bottom ?? 0), vh: innerHeight, scrollH: document.documentElement.scrollHeight, lastText: rows[rows.length - 1]?.textContent } })
  console.log('sold', sold, JSON.stringify(r))
  if (sold === 8) await p.screenshot({ path: 'shots/tv-auction-8sold.png' })
  await c.close()
}
await b.close()
