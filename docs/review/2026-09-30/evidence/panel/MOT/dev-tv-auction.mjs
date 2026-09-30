// Dev server, TV 1920x1080: Calcutta night synthesized from full12-live: lots 1-6 sold, lot 7 open with bids.
// Then: a new bid (pulse), then the hammer (lot 7 sold) -> what the room sees.
import { launch, ctx } from './lib.mjs'
const DEVBASE = process.env.DEVBASE || 'http://127.0.0.1:4196'
const b = await launch()
const c = await ctx(b, 'tv')
const p = await c.newPage()
await p.goto(DEVBASE + '/t/_/full12-live/tv', { waitUntil: 'networkidle' })
await p.waitForTimeout(2000)
await p.evaluate(async () => {
  const m = await import('/src/data/tournamentStore.ts'); window.__store = m.useTournament
  window.__store.getState().patch((s) => {
    s.tournament.status = 'auction'
    s.scores = []
    s.calcuttaBuybacks = []
    s.calcuttaLots.sort((a, b) => a.lotNumber - b.lotNumber)
    s.calcuttaLots.forEach((l, i) => { if (i >= 6) { l.status = i === 6 ? 'open' : 'pending'; l.price = null; l.ownerId = null; l.soldAt = null } })
    const open = s.calcuttaLots[6]
    s.calcuttaBids = s.calcuttaBids.filter((bd) => s.calcuttaLots.findIndex((l) => l.id === bd.lotId) < 6)
    s.calcuttaBids.push({ id: 'x1', lotId: open.id, bidderId: s.players[0].id === open.playerId ? s.players[1].id : s.players[0].id, amount: 750, createdAt: '2027-04-08T21:00:00Z' })
  })
})
await p.waitForTimeout(1200)
await p.screenshot({ path: 'shots/tv-auction-open.png' })
const potOf = () => p.evaluate(() => document.querySelector('[class*="pot_"]')?.textContent)
console.log('pot before', await potOf())
// sample bid box + pot transforms each frame
const SAMPLE = () => p.evaluate(() => { window.__tv = []; const t0 = performance.now(); const f = () => { const bid = document.querySelector('[class*="bid_"]'); const pot = document.querySelector('[class*="pot_"]'); const lotName = document.querySelector('[class*="lotName"]')?.textContent; const m = (el) => el ? new DOMMatrix(getComputedStyle(el).transform === 'none' ? undefined : getComputedStyle(el).transform).a.toFixed(3) : null; window.__tv.push([Math.round(performance.now() - t0), m(bid), m(pot), bid ? getComputedStyle(bid).opacity : null, lotName, pot?.textContent]); if (performance.now() - t0 < 1200) requestAnimationFrame(f) }; requestAnimationFrame(f) })
// 1) a new bid
await SAMPLE()
await p.evaluate(() => window.__store.getState().patch((s) => { const open = s.calcuttaLots.find((l) => l.status === 'open'); s.calcuttaBids.push({ id: 'x2', lotId: open.id, bidderId: s.players[2].id === open.playerId ? s.players[3].id : s.players[2].id, amount: 1000, createdAt: '2027-04-08T21:00:10Z' }) }))
await p.waitForTimeout(60); await p.screenshot({ path: 'shots/tv-auction-bid-60ms.png' })
await p.waitForTimeout(1200)
const bidTrace = await p.evaluate(() => window.__tv)
const bidAnim = bidTrace.filter((x) => x[1] && x[1] !== '1.000')
console.log('bid pulse frames', bidAnim.length, bidAnim.length ? `${bidAnim[0][0]}..${bidAnim[bidAnim.length - 1][0]}ms scale ${bidAnim[0][1]}→` : '')
// 2) the hammer: lot sold to the high bidder
await SAMPLE()
await p.evaluate(() => window.__store.getState().patch((s) => { const open = s.calcuttaLots.find((l) => l.status === 'open'); const hi = s.calcuttaBids.filter((bd) => bd.lotId === open.id).sort((a, b) => b.amount - a.amount)[0]; open.status = 'sold'; open.price = hi.amount; open.ownerId = hi.bidderId; open.soldAt = '2027-04-08T21:01:00Z' }))
await p.waitForTimeout(80); await p.screenshot({ path: 'shots/tv-auction-sold-80ms.png' })
await p.waitForTimeout(1200)
await p.screenshot({ path: 'shots/tv-auction-sold-1300ms.png' })
const soldTrace = await p.evaluate(() => window.__tv)
const names = [...new Set(soldTrace.map((x) => x[4]))]
const potVals = [...new Set(soldTrace.map((x) => x[5]))]
const potScale = soldTrace.map((x) => parseFloat(x[2])).filter((x) => !isNaN(x))
console.log('lot card names during hammer', JSON.stringify(names), '| pot text', JSON.stringify(potVals), '| pot scale min/max', Math.min(...potScale), Math.max(...potScale), '| bid box present after', soldTrace[soldTrace.length - 1][1] !== null)
const potFrames = soldTrace.filter((x) => x[2] && x[2] !== '1.000')
console.log('pot anim frames', potFrames.length, potFrames.length ? `${potFrames[0][0]}..${potFrames[potFrames.length - 1][0]}ms` : '', JSON.stringify(potFrames.slice(0, 30).map((x) => x[2])))
await b.close()
