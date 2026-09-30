// UX-02 + PWA-01 independent repro on the real Tarjeta (fixture full12-live, admin p9 in group).
// Score upserts are intercepted and answered 201 locally (recorded, nothing reaches Supabase); all other
// supabase.co requests are aborted. Touch emulation; safe-area insets through CDP where a geometry needs them.
import { launch, phone, BASE, sleep, logTo, SHOTS } from './lib.mjs'
const log = logTo('tarjeta-taps.log')
const GEOS = [
  { name: '15pro-browser 393x852 no insets', width: 393, height: 852, insets: null },
  { name: '15pro-standalone 393x852 insets 59/34', width: 393, height: 852, insets: { top: 59, bottom: 34, left: 0, right: 0 } },
  { name: '15pro-safari 393x659', width: 393, height: 659, insets: null },
  { name: 'se 375x667', width: 375, height: 667, insets: null },
  { name: 'android 412x915', width: 412, height: 915, insets: null },
]
const ONLY = process.argv[2] ?? 'all'
const b = await launch()

async function open(geo, path = '/t/_/full12-live/tarjeta') {
  const writes = []
  const { ctx, page } = await phone(b, {
    width: geo.width,
    height: geo.height,
    insets: geo.insets,
    onSupabase: async (route) => {
      const req = route.request()
      if (/\/rest\/v1\/scores/.test(req.url()) && req.method() === 'POST') {
        let body = []
        try {
          body = JSON.parse(req.postData() || '[]')
        } catch {}
        for (const r of [].concat(body)) writes.push({ t: Date.now(), hole: r.hole, player: r.player_id, strokes: r.strokes, putts: r.putts })
        return route.fulfill({ status: 201, body: '' })
      }
      return route.abort()
    },
  })
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' })
  const btn = page.locator('[class*=saveBar] button').first()
  await btn.waitFor()
  await sleep(800)
  return { ctx, page, btn, writes }
}
const holeNow = (page) => page.locator('[class*=holeNum]').first().textContent().catch(() => 'grid')
const hit = (page, x, y) =>
  page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y)
    if (!el) return null
    const b = el.closest('button')
    const txt = (b ?? el).textContent.trim().slice(0, 22)
    return `${b ? 'BUTTON' : el.tagName} "${txt}"`
  }, { x, y })
const holesWritten = (writes) => [...new Set(writes.map((w) => w.hole))]

// 1. Geometry: what a tap at each point across «Guardar hoyo» hits while the toast is up; the busy window.
if (ONLY === 'all' || ONLY === 'geo') {
  for (const geo of GEOS) {
    const { ctx, page, btn, writes } = await open(geo)
    const h0 = await holeNow(page)
    const bb = await btn.boundingBox()
    const t0 = Date.now()
    await page.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2)
    let busyMs = null
    for (let i = 0; i < 300; i++) {
      if ((await holeNow(page)) !== h0) {
        busyMs = Date.now() - t0
        break
      }
      await sleep(5)
    }
    await sleep(600)
    const bb2 = await btn.boundingBox()
    const toast = page.locator('[role=status]').filter({ hasText: 'guardado' }).first()
    const tb = await toast.boundingBox().catch(() => null)
    const ab = await toast.locator('button').boundingBox().catch(() => null)
    const cy = bb2.y + bb2.height / 2
    const points = {}
    for (const f of [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.65, 0.7, 0.8, 0.9]) points[`${Math.round(f * 100)}%`] = await hit(page, bb2.x + bb2.width * f, cy)
    // share of the button's area under the toast (pointer-events: auto on .toast)
    let covered = 0
    if (tb) {
      const ix = Math.max(0, Math.min(bb2.x + bb2.width, tb.x + tb.width) - Math.max(bb2.x, tb.x))
      const iy = Math.max(0, Math.min(bb2.y + bb2.height, tb.y + tb.height) - Math.max(bb2.y, tb.y))
      covered = Math.round(((ix * iy) / (bb2.width * bb2.height)) * 100)
    }
    const r = { geo: geo.name, hole: `${h0}→${await holeNow(page)}`, commitMs: busyMs, save: bb2 && { x: Math.round(bb2.x), y: Math.round(bb2.y), w: Math.round(bb2.width), h: Math.round(bb2.height) }, toast: tb && { x: Math.round(tb.x), y: Math.round(tb.y), w: Math.round(tb.width), h: Math.round(tb.height) }, action: ab && { x: Math.round(ab.x), y: Math.round(ab.y), w: Math.round(ab.width), h: Math.round(ab.height) }, coveredPct: covered, hits: points, writes: holesWritten(writes) }
    log('GEO', JSON.stringify(r))
    if (geo.name.startsWith('se ')) await page.screenshot({ path: `${SHOTS}/t_tarjeta-full12-live-se-light-v3-toast-over-save.png` })
    if (geo.name.startsWith('15pro-standalone')) await page.screenshot({ path: `${SHOTS}/t_tarjeta-full12-live-15pro-light-v3-standalone-toast-over-save.png` })
    await ctx.close()
  }
}

// 2. UX-02: two taps at the same spot `gap` ms apart, at the centre and at the right edge of the button.
if (ONLY === 'all' || ONLY === 'double') {
  for (const geo of GEOS) {
    for (const where of ['center', 'right']) {
      const row = []
      for (const gap of [120, 250, 400, 700]) {
        const { ctx, page, btn, writes } = await open(geo)
        const h0 = await holeNow(page)
        const bb = await btn.boundingBox()
        const x = where === 'center' ? bb.x + bb.width / 2 : bb.x + bb.width - 30
        const y = bb.y + bb.height / 2
        await page.touchscreen.tap(x, y)
        await sleep(gap)
        const second = await hit(page, x, y)
        await page.touchscreen.tap(x, y)
        await sleep(1500)
        row.push({ gap, secondTapHit: second, hole: `${h0}→${await holeNow(page)}`, holesWritten: holesWritten(writes), phantom: writes.filter((w) => w.hole !== Number(h0)).map((w) => `${w.hole}:${w.strokes}/${w.putts}`) })
        await ctx.close()
      }
      log('DOUBLE', JSON.stringify({ geo: geo.name, where, row }))
    }
  }
}

// 3. PWA-01: the group enters the next hole quickly (catch-up) and taps «Guardar hoyo» 3 s after the previous save.
if (ONLY === 'all' || ONLY === 'next') {
  for (const geo of GEOS) {
    for (const where of ['center', 'right-of-center']) {
      const { ctx, page, btn, writes } = await open(geo)
      const h0 = await holeNow(page)
      let bb = await btn.boundingBox()
      await page.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2) // save hole h0
      await sleep(700)
      const h1 = await holeNow(page)
      await page.getByRole('button', { name: /Golpes: más/ }).first().tap() // enter something on the next hole
      await sleep(1500)
      bb = await btn.boundingBox()
      const x = where === 'center' ? bb.x + bb.width / 2 : bb.x + bb.width * 0.65
      const y = bb.y + bb.height / 2
      const target = await hit(page, x, y)
      await page.touchscreen.tap(x, y) // ~2.3 s after the previous save: the toast is still up (6 s)
      await sleep(1200)
      log('NEXT', JSON.stringify({ geo: geo.name, where, sequence: `${h0}→${h1}→${await holeNow(page)}`, tapHit: target, holesWritten: holesWritten(writes) }))
      await ctx.close()
    }
  }
}
await b.close()
