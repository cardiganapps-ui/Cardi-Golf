// V13 / MOT-04: TV auction board on a synthetic auction night (dev server, real store + engine).
// usage: node mot04-tv.mjs [base=http://127.0.0.1:4213]
import { chromium } from 'playwright-core'
import { writeFileSync } from 'node:fs'

const BASE = process.argv[2] ?? 'http://127.0.0.1:4213'
const E = '/tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad/verify/evidence/V13'
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const out = { overflow: [], hammer: null }

// n sold (lot numbers 1..n keep their fixture sale), lot n+1 open (or pending when openNext=false), the rest pending.
async function setAuction(page, n, { openNext = true, logo = null } = {}) {
  await page.evaluate(
    async ({ n, openNext, logo }) => {
      const m = await import('/src/data/tournamentStore.ts')
      window.__st = m.useTournament
      if (!window.__orig) {
        const s0 = m.useTournament.getState().data.snapshot
        window.__orig = structuredClone({ lots: s0.calcuttaLots, bids: s0.calcuttaBids })
      }
      m.useTournament.getState().patch((s) => {
        s.calcuttaLots = structuredClone(window.__orig.lots)
        s.calcuttaBids = structuredClone(window.__orig.bids)
        s.tournament.status = 'auction'
        if (logo) s.tournament.logoUrl = logo
        s.calcuttaBuybacks = []
        s.calcuttaLots.sort((a, b) => a.lotNumber - b.lotNumber)
        const keep = new Set()
        s.calcuttaLots.forEach((l, i) => {
          if (i < n) {
            keep.add(l.id)
            return
          }
          l.status = i === n && openNext ? 'open' : 'pending'
          l.price = null
          l.ownerId = null
          l.soldAt = null
        })
        s.calcuttaBids = s.calcuttaBids.filter((bd) => keep.has(bd.lotId))
      })
    },
    { n, openNext, logo },
  )
}

async function measure(page) {
  return page.evaluate(() => {
    const r = (el) => {
      const x = el.getBoundingClientRect()
      return { top: Math.round(x.top), bottom: Math.round(x.bottom) }
    }
    const sold = document.querySelector('[class*="_sold_"]')
    const rows = [...document.querySelectorAll('[class*="soldRow"]')]
    const box = sold ? r(sold) : null
    const rowInfo = rows.map((el) => ({ text: el.textContent, ...r(el) }))
    const visible = rowInfo.filter((x) => box && x.bottom <= box.bottom + 0.5 && x.top >= box.top - 0.5)
    const partial = rowInfo.filter((x) => box && x.top < box.bottom && x.bottom > box.bottom + 0.5).length
    const lot = document.querySelector('[class*="_lot_"]')
    return {
      vh: innerHeight,
      vw: innerWidth,
      soldBox: box,
      rowsRendered: rows.length,
      rowsFullyVisible: visible.length,
      rowsPartlyClipped: partial,
      newest: rowInfo[rowInfo.length - 1] ?? null,
      newestFullyVisible: rowInfo.length ? visible.includes(rowInfo[rowInfo.length - 1]) : null,
      lotCard: lot?.innerText.replace(/\n+/g, ' | ').slice(0, 160),
      hasBidBox: !!document.querySelector('[class*="bidAmount"]'),
      vendidoOnPage: /vendido/i.test(document.body.innerText.replace(/Vendidos/g, '')),
    }
  })
}

const viewports = [
  { name: 'tv1080', width: 1920, height: 1080 },
  { name: 'tv720', width: 1280, height: 720 },
  { name: 'laptop768', width: 1366, height: 768 },
  { name: 'tv4k', width: 3840, height: 2160 },
]
for (const vp of viewports) {
  for (const logo of [null, '/icons/icon-512.png']) {
    const ctx = await b.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1 })
    const page = await ctx.newPage()
    await page.goto(`${BASE}/t/_/full12-live/tv`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(1200)
    for (const n of [6, 7, 8, 9, 11, 12]) {
      await setAuction(page, n, { openNext: n < 12, logo })
      await page.waitForTimeout(700)
      const m = await measure(page)
      out.overflow.push({ vp: vp.name, logo: !!logo, sold: n, ...m })
      console.log(`${vp.name} logo=${!!logo} sold=${n}: rendered ${m.rowsRendered}, fully visible ${m.rowsFullyVisible}, cut ${m.rowsPartlyClipped}, newest ${JSON.stringify(m.newest?.text)} ${m.newest?.top}-${m.newest?.bottom} in box ${m.soldBox?.top}-${m.soldBox?.bottom} visible=${m.newestFullyVisible}`)
      if (vp.name === 'tv1080' && logo && (n === 8 || n === 11)) await page.screenshot({ path: `${E}/mot04-${vp.name}-logo-sold${n}.png` })
    }
    await ctx.close()
  }
}

// Hammer: lot 7 open with a $1,000 bid, then the sale lands (same pipeline as a Realtime reload).
{
  const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 })
  const page = await ctx.newPage()
  await page.goto(`${BASE}/t/_/full12-live/tv`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)
  await setAuction(page, 6, { openNext: true, logo: '/icons/icon-512.png' })
  const bidder = await page.evaluate(() => {
    const s = window.__st.getState().data.snapshot
    const lot = [...s.calcuttaLots].sort((a, b) => a.lotNumber - b.lotNumber)[6]
    const bidder = s.players.find((p) => p.id !== lot.playerId).id
    window.__st.getState().patch((x) => {
      x.calcuttaBids.push({ id: 'v13bid', lotId: lot.id, bidderId: bidder, amount: 1000, createdAt: new Date().toISOString() })
    })
    return { lotId: lot.id, bidder, player: s.players.find((p) => p.id === lot.playerId).displayName, bidderName: s.players.find((p) => p.id === bidder).displayName }
  })
  await page.waitForTimeout(600)
  const before = await measure(page)
  await page.screenshot({ path: `${E}/mot04-hammer-before.png` })
  // The hammer: status sold with price and owner, as sellLot writes it.
  const frames = await page.evaluate(async ({ lotId, bidder }) => {
    const snapText = () => document.querySelector('[class*="_lot_"]')?.innerText.replace(/\n+/g, ' | ').slice(0, 120)
    const res = []
    window.__st.getState().patch((x) => {
      const l = x.calcuttaLots.find((l) => l.id === lotId)
      l.status = 'sold'
      l.price = 1000
      l.ownerId = bidder
      l.soldAt = new Date().toISOString()
    })
    const t0 = performance.now()
    for (const wait of [0, 16, 50, 100, 250, 500, 1000, 2000, 4000]) {
      while (performance.now() - t0 < wait) await new Promise((r) => requestAnimationFrame(r))
      res.push({ ms: wait, lotCard: snapText(), bidBox: !!document.querySelector('[class*="bidAmount"]'), vendido: /vendido/i.test(document.body.innerText.replace(/Vendidos/g, '')) })
    }
    return res
  }, bidder)
  const after = await measure(page)
  await page.screenshot({ path: `${E}/mot04-hammer-after.png` })
  out.hammer = { bidder, before, frames, after }
  console.log('BEFORE hammer:', before.lotCard, 'bidBox', before.hasBidBox)
  for (const f of frames) console.log(`  +${f.ms}ms lot card: ${f.lotCard} | bidBox ${f.bidBox} | 'Vendido' on page ${f.vendido}`)
  console.log('AFTER sold list newest:', JSON.stringify(after.newest), 'visible', after.newestFullyVisible)
  await ctx.close()
}
writeFileSync(`${E}/mot04-tv.json`, JSON.stringify(out, null, 2))
await b.close()
