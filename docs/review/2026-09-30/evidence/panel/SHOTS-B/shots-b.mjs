#!/usr/bin/env node
// SHOTS-B: Comité console, TV, Ceremonia and printable cards on the in-memory fixtures.
//   node shots-b.mjs admin|admin15|states|tv|ceremonia|print|patched [...]
import { launch, close, newPage, go, capture, saveRecords, loadRecords, settle, resetEv, BASE, EV } from './lib.mjs'

const SECTIONS = ['torneo', 'jugadores', 'campos', 'rondas', 'grupos', 'handicaps', 'juegos', 'scores', 'calcutta', 'parejas', 'equipos', 'historial', 'datos']
const ADMIN_FIX = ['full12-live', 'large60', 'longnames', 'friends8', 'minimal4-setup']
const FULL_OF = ['jugadores', 'scores', 'calcutta']
const phases = process.argv.slice(2)

await launch()
try {
  for (const phase of phases) {
    console.log(`== ${phase}`)
    if (phase === 'admin') saveRecords(phase, await adminPhase('laptop', ADMIN_FIX, true))
    else if (phase === 'admin15') saveRecords(phase, await adminPhase('15pro', ['full12-live'], false))
    else if (phase === 'states') saveRecords(phase, await statesPhase())
    else if (phase === 'tv') saveRecords(phase, await tvPhase())
    else if (phase === 'ceremonia') saveRecords(phase, await ceremonyPhase())
    else if (phase === 'print') saveRecords(phase, await printPhase())
    else if (phase === 'patched') saveRecords(phase, await patchedPhase())
    else console.log('unknown phase', phase)
  }
} finally {
  await close()
}

/** Nav presence of a section + the badge numbers, from the Comité shell. */
async function navInfo(page, section) {
  return page.evaluate((section) => {
    const links = [...document.querySelectorAll('main nav a')]
    const here = links.find((a) => a.getAttribute('href')?.endsWith(`/admin/${section}`))
    return { inNav: !!here, items: links.map((a) => a.innerText.replace(/\s+/g, ' ').trim()) }
  }, section)
}

async function adminPhase(device, fixtures, withFull) {
  const page = await newPage(device)
  const out = []
  for (const fx of fixtures) {
    for (const s of SECTIONS) {
      const url = `/t/_/${fx}/admin/${s}`
      await go(page, url)
      const nav = await navInfo(page, s)
      const extra = nav.inNav ? [] : [`section not in this fixture's Comité nav (module/format off); reached by direct URL`]
      const base = { url, device, fixture: fx, route: `t_admin_${s}`, state: 'default' }
      out.push(await capture(page, { ...base, file: `t_admin_${s}-${fx}-${device}-light.png` }, { extraObs: [...extra, `nav: ${nav.items.join(' · ')}`] }))
      if (withFull && FULL_OF.includes(s)) {
        out.push(await capture(page, { ...base, state: 'full', file: `t_admin_${s}-${fx}-${device}-light-full.png` }, { full: true, extraObs: extra }))
      }
    }
  }
  await page.context().close()
  return out
}

/** Scroll the open sheet's body (the overflow-y:auto child of [role=dialog]) to top/bottom/px. */
async function scrollSheet(page, to) {
  await page.evaluate((to) => {
    const d = document.querySelector('[role=dialog]')
    if (!d) return
    const body = [...d.querySelectorAll('*')].find((el) => /(auto|scroll)/.test(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight)
    if (!body) return
    body.scrollTop = to === 'bottom' ? body.scrollHeight : to === 'top' ? 0 : Number(to)
  }, to)
  await page.waitForTimeout(300)
}
async function sheetInfo(page) {
  return page.evaluate(() => {
    const d = document.querySelector('[role=dialog]')
    if (!d) return 'no dialog open'
    const r = d.getBoundingClientRect()
    const body = [...d.querySelectorAll('*')].find((el) => /(auto|scroll)/.test(getComputedStyle(el).overflowY))
    return `sheet "${d.getAttribute('aria-label')}" ${Math.round(r.width)}×${Math.round(r.height)} at y=${Math.round(r.top)}${body ? `, body scrolls ${body.scrollHeight}px in ${body.clientHeight}px` : ''}`
  })
}

async function statesPhase() {
  const device = 'laptop'
  const fx = 'full12-live'
  const page = await newPage(device)
  const out = []
  const rec = (section, state, url) => ({ url, device, fixture: fx, route: `t_admin_${section}`, state, file: `t_admin_${section}-${fx}-${device}-light-${state}.png` })
  const snap = async (section, state, url, opts = {}) => {
    await page.waitForTimeout(150)
    await settle(page, 600)
    const extra = [...(opts.extraObs ?? [])]
    if (await page.locator('[role=dialog]').count()) extra.push(await sheetInfo(page))
    out.push(await capture(page, rec(section, state, url), { ...opts, extraObs: extra }))
  }

  // Jugadores: edit sheet (manual), scrolled, estimate, index, PIN.
  let url = `/t/_/${fx}/admin/jugadores`
  await go(page, url)
  await page.getByRole('button', { name: /Arturo Beltrán/ }).first().click()
  await page.locator('[role=dialog]').waitFor()
  await snap('jugadores', 'edit', url)
  await scrollSheet(page, 'bottom')
  await snap('jugadores', 'edit-2', url, { extraObs: ['sheet body scrolled to the bottom'] })
  await scrollSheet(page, 'top')
  await page.getByRole('tab', { name: 'Estimar con tres rondas' }).click()
  await snap('jugadores', 'edit-estimate', url)
  await scrollSheet(page, 900)
  await snap('jugadores', 'edit-estimate-2', url, { extraObs: ['sheet body scrolled 900px'] })
  const how = page.locator('[role=dialog]').getByRole('button', { name: /Cómo se calculó/ }).first()
  if (await how.count()) {
    await how.click()
    await page.waitForTimeout(300)
    await snap('jugadores', 'edit-estimate-why', url, { extraObs: ['«¿Cómo se calculó?» from the preview: opens a second sheet stacked on the edit sheet'] })
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
  }
  await scrollSheet(page, 'top')
  await page.getByRole('tab', { name: 'Índice WHS' }).click()
  await snap('jugadores', 'edit-index', url)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: /Poner PIN|Cambiar PIN/ }).first().click()
  await page.locator('[role=dialog]').waitFor()
  await snap('jugadores', 'pin', url, { extraObs: ['PIN sheet for the first player (fixture: players_with_pin fails, so every row offers «Poner PIN»)'] })
  await page.keyboard.press('Escape')

  // Campos: search sheet, manual editor blank → pasted → invalid.
  url = `/t/_/${fx}/admin/campos`
  await go(page, url)
  await page.getByRole('button', { name: 'Buscar campo' }).click()
  await page.locator('[role=dialog]').waitFor()
  await page.locator('[role=dialog] input').first().fill('Solmar')
  await snap('campos', 'search', url, { extraObs: ['search sheet with a query typed, not submitted (no /api on the preview server)'] })
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: 'Capturar a mano' }).click()
  await page.locator('[role=dialog]').waitFor()
  await snap('campos', 'editor-blank', url, { extraObs: ['«Capturar a mano»: blank 18-hole tee (the only editor reachable on fixtures: the course list is read from Supabase and is empty for anon)'] })
  const dlg = page.locator('[role=dialog]')
  const inputs = dlg.locator('input')
  await inputs.nth(0).fill('Solmar Golf Links')
  await inputs.nth(1).fill('Cabo San Lucas, BCS')
  await dlg.locator('summary').click()
  await dlg.locator('textarea').fill('4 4 3 5 4 4 3 4 5 4 3 4 5 4 4 3 4 5\n7 11 17 3 1 13 15 9 5 8 18 2 12 4 10 16 6 14\n410 395 180 540 430 405 165 420 560 400 175 415 530 390 440 190 425 580')
  await snap('campos', 'editor-paste', url, { extraObs: ['bulk paste open with three lines (par, SI, yards) typed'] })
  await dlg.getByRole('button', { name: /Aplicar|Pegar/ }).first().click().catch(() => undefined)
  await page.waitForTimeout(300)
  await scrollSheet(page, 'top')
  await snap('campos', 'editor-filled', url, { extraObs: ['after applying the paste'] })
  await scrollSheet(page, 'bottom')
  await snap('campos', 'editor-filled-2', url, { extraObs: ['sheet body scrolled to the bottom (totals, save)'] })
  // Make SI invalid: hole 2 gets SI 7 (duplicate of hole 1).
  const siInputs = dlg.locator('tbody tr td:nth-child(3) input')
  if (await siInputs.count()) {
    await siInputs.nth(1).fill('7')
    await siInputs.nth(1).blur()
    await page.waitForTimeout(300)
    await scrollSheet(page, 'bottom')
    await snap('campos', 'editor-invalid', url, { extraObs: ['hole 2 SI set to 7 (duplicate) to show validation'] })
  }
  await page.keyboard.press('Escape')

  // Calcutta: the fixture has every lot sold; the console shows what's there (base shot covers it).
  // Parejas: honoree picks, then the draw.
  url = `/t/_/${fx}/admin/parejas`
  await go(page, url)
  const tile = page.locator('[role=radiogroup] [role=radio]').first()
  if (await tile.count()) {
    await tile.click()
    await snap('parejas', 'pick', url, { extraObs: ['honoree has picked his partner (first eligible tile)'] })
  }
  await page.getByRole('button', { name: /Sortear el resto|Volver a sortear/ }).click()
  await page.waitForTimeout(400)
  await snap('parejas', 'drawn', url, { extraObs: ['after «Sortear el resto» (reduced motion: all pairs shown at once; nothing saved)'] })
  out.push(await capture(page, { ...rec('parejas', 'drawn-full', url) }, { full: true }))

  // Hándicaps: default view is Día 2 (current round). «?» of a player with a cut, and the override sheet.
  url = `/t/_/${fx}/admin/handicaps`
  await go(page, url)
  out.push(await capture(page, rec('handicaps', 'day2-full', url), { full: true, extraObs: ['Day-2 review (the current round), whole page'] }))
  const cutRow = page.locator('main [class*="_row_"]').filter({ hasText: /recorte/i }).first()
  const target = (await cutRow.count()) ? cutRow : page.locator('main [class*="_row_"]').first()
  const cutName = await target.locator('[class*="_rowTitle_"]').first().innerText()
  await target.getByRole('button', { name: '?' }).first().click().catch(async () => target.locator('button').first().click())
  await page.waitForTimeout(300)
  await snap('handicaps', 'why', url, { extraObs: [`«?» (¿Cómo se calculó?) opened on ${cutName}${(await cutRow.count()) ? ' (a player with a Day-2 cut)' : ' (no row mentions a cut)'}`] })
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  await target.getByRole('button', { name: 'Editar' }).click()
  await page.locator('[role=dialog]').waitFor()
  await snap('handicaps', 'override', url, { extraObs: [`override sheet for ${cutName}`] })
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  await page.getByRole('tab', { name: 'Día 1' }).click()
  await snap('handicaps', 'day1', url)

  // Tarjetas: Día 1, first player (pair 1 signed on day 1) → hole 1 → reason prompt. Día 2 unsigned for contrast.
  url = `/t/_/${fx}/admin/scores`
  await go(page, url)
  await page.getByRole('tab', { name: 'Día 1' }).click()
  await page.waitForTimeout(200)
  const holeBtn = page.locator('#admin-card button[class*=hole]').first()
  await holeBtn.scrollIntoViewIfNeeded()
  await snap('scores', 'day1-card', url, { extraObs: ['Día 1 card of the first player (signed)'] })
  await holeBtn.click()
  await page.locator('[role=dialog]').waitFor()
  await snap('scores', 'edit-reason', url, { extraObs: ['hole edit on a signed card: the reason field is required'] })
  await page.locator('[role=dialog] input').last().fill('Error de dedo')
  await snap('scores', 'edit-reason-typed', url, { extraObs: ['reason typed; save enabled'] })
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  await page.getByRole('tab', { name: 'Día 2' }).click()
  await page.waitForTimeout(200)
  await page.locator('#admin-card button[class*=hole]').first().click()
  await page.locator('[role=dialog]').waitFor()
  await snap('scores', 'edit-unsigned', url, { extraObs: ['hole edit on an unsigned Day-2 card: no reason asked'] })
  await page.keyboard.press('Escape')

  await page.context().close()
  return out
}

/** TV: capture each distinct slide as it rotates (real time, no reduced motion). Fixtures run in parallel pages. */
async function tvPhase() {
  const fixtures = ['full12-live', 'full12-finished', 'large60', 'longnames']
  const results = await Promise.all(fixtures.map((fx) => tvOne(fx)))
  return results.flat()
}

async function tvOne(fx) {
  const device = 'tv'
  const page = await newPage(device, { reducedMotion: 'no-preference' })
  const url = `/t/_/${fx}/tv`
  const out = []
  await go(page, url, { extra: 300 })
  const key = () =>
    page.evaluate(() => {
      const h = document.querySelector('section h2')
      return h ? h.innerText.replace(/\s+/g, ' ').trim() : '(no board title)'
    })
  const seen = new Map()
  const t0 = Date.now()
  let n = 0
  let first = null
  let last = null
  const LIMIT = 200_000
  while (Date.now() - t0 < LIMIT) {
    const k = await key()
    if (k !== last) {
      last = k
      if (first !== null && k === first) break // full cycle
      if (first === null) first = k
      if (!seen.has(k)) {
        await page.waitForTimeout(900) // let the 250 ms enter animation settle
        const kk = await key()
        n++
        seen.set(kk, n)
        const r = await capture(
          page,
          { url, device, fixture: fx, route: 't_tv', state: `slide${n}`, file: `t_tv-${fx}-${device}-dark-slide${n}.png` },
          { extraObs: [`board: «${kk}»; shown at t≈${Math.round((Date.now() - t0) / 1000)}s`] },
        )
        out.push(r)
        resetEv(page)
      }
    }
    await page.waitForTimeout(400)
  }
  console.log(`  ${fx}: ${seen.size} distinct slides in ${Math.round((Date.now() - t0) / 1000)}s: ${[...seen.keys()].join(' | ')}`)
  for (const r of out) r.observations.push(`rotation for this fixture: ${[...seen.keys()].map((k) => `«${k}»`).join(' → ')}`)
  await page.context().close()
  return out
}

async function ceremonyPhase() {
  const out = process.env.CONFETTI_ONLY ? loadRecords('ceremonia').filter((r) => r.state !== 'champion-confetti') : []
  const fx = 'full12-finished'
  const url = `/t/_/${fx}/ceremonia`
  for (const device of process.env.CONFETTI_ONLY ? [] : ['tv', '15pro']) {
    const page = await newPage(device)
    await go(page, url)
    let step = 1
    const name = () => `t_ceremonia-${fx}-${device}-dark-step${String(step).padStart(2, '0')}.png`
    const state = async () =>
      page.evaluate(() => {
        const h = document.querySelector('main h2')
        const prog = [...document.querySelectorAll('footer span')].map((s) => s.innerText).join(' ')
        const btns = [...document.querySelectorAll('main button')].map((b) => b.innerText.trim())
        return { title: h?.innerText.trim() ?? '(start)', prog, btns }
      })
    const shot = async (desc) => {
      await settle(page, 700)
      const s = await state()
      out.push(await capture(page, { url, device, fixture: fx, route: 't_ceremonia', state: `step${String(step).padStart(2, '0')}`, file: name() }, { extraObs: [`${desc}; title «${s.title}»; progress «${s.prog}»`] }))
      step++
    }
    await shot('start screen')
    const maxShots = device === 'tv' ? 60 : 3
    await page.getByRole('button', { name: 'Empezar la ceremonia' }).click()
    await shot('after «Empezar la ceremonia»')
    while (step <= maxShots) {
      const reveal = page.getByRole('button', { name: 'Revelar' })
      if (await reveal.count()) {
        await reveal.click()
        await page.waitForTimeout(500)
        await shot('after «Revelar»')
        continue
      }
      const next = page.locator('footer').getByRole('button', { name: 'Siguiente' })
      if (!(await next.isEnabled())) break
      await next.click()
      await shot('after «Siguiente»')
    }
    await page.context().close()
  }
  // Champion reveal with motion on (confetti), TV only.
  const page = await newPage('tv', { reducedMotion: 'no-preference' })
  await go(page, url)
  await page.getByRole('button', { name: 'Empezar la ceremonia' }).click()
  const titleNow = () => page.evaluate(() => document.querySelector('main h2')?.innerText.trim() ?? '')
  await page.waitForFunction(() => !!document.querySelector('main h2'))
  for (let i = 0; i < 40; i++) {
    const title = await titleNow()
    if (/campeón/i.test(title)) break
    await page.locator('footer').getByRole('button', { name: 'Siguiente' }).click()
    await page.waitForFunction((prev) => (document.querySelector('main h2')?.innerText.trim() ?? '') !== prev, title, { timeout: 5000 })
    await page.waitForTimeout(400)
  }
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: 'Revelar' }).click()
  await page.waitForTimeout(650)
  out.push(await capture(page, { url, device: 'tv', fixture: fx, route: 't_ceremonia', state: 'champion-confetti', file: `t_ceremonia-${fx}-tv-dark-champion-confetti.png` }, { extraObs: ['champion revealed with motion ON (no reduced motion): confetti ~650 ms after «Revelar»'] }))
  await page.context().close()
  return out
}

async function printPhase() {
  const out = []
  const fx = 'full12-live'
  const url = `/t/_/${fx}/imprimir`
  const device = 'laptop'
  const page = await newPage(device)
  await go(page, url)
  const dots = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('main section')]
    return cards.map((c) => {
      const title = c.querySelector('header')?.innerText.replace(/\s+/g, ' ').trim()
      const players = [...c.querySelectorAll('tbody tr')].filter((tr) => tr.querySelector('strong')).map((tr) => {
        const nm = tr.querySelector('strong')?.innerText
        const d = [...tr.querySelectorAll('td')].map((td) => td.innerText.trim()).filter((x) => /^•+$/.test(x))
        return `${nm}: ${d.reduce((a, x) => a + x.length, 0)} dots on ${d.length} holes`
      })
      return `${title} — ${players.join('; ')}`
    })
  })
  const base = { url, device, fixture: fx, route: 't_imprimir' }
  out.push(await capture(page, { ...base, state: 'default', file: `t_imprimir-${fx}-${device}-light.png` }, { extraObs: dots.map((d) => `card: ${d}`) }))
  out.push(await capture(page, { ...base, state: 'full', file: `t_imprimir-${fx}-${device}-light-full.png` }, { full: true }))
  await page.emulateMedia({ media: 'print' })
  await page.waitForTimeout(400)
  out.push(await capture(page, { ...base, state: 'print', file: `t_imprimir-${fx}-${device}-light-print.png` }, { full: true, extraObs: ['emulateMedia print, full page (capped)'] }))
  await page.emulateMedia({ media: 'screen' })
  await page.pdf({ path: `${EV}/print-full12-live.pdf`, format: 'Letter', printBackground: true })
  await page.pdf({ path: `${EV}/print-full12-live-a4.pdf`, format: 'A4', printBackground: true })
  // Day 1 as well (the segmented control), screen only.
  const day1 = page.getByRole('tab', { name: 'Día 1' }).or(page.getByRole('radio', { name: 'Día 1' })).or(page.getByRole('button', { name: 'Día 1' }))
  if (await day1.count()) {
    await day1.first().click()
    await settle(page, 400)
    out.push(await capture(page, { ...base, state: 'day1', file: `t_imprimir-${fx}-${device}-light-day1.png` }, { extraObs: ['Día 1 selected in the toolbar'] }))
  }
  await page.context().close()
  return out
}

/**
 * SYNTHETIC state: Calcutta night mid-lot. No fixture has status 'auction', so this
 * hooks structuredClone (FixtureGate clones the snapshot before feeding the engine)
 * and rewrites the full12-live snapshot in the browser only: status 'auction', no
 * rounds played, no pairs/groups yet, lots 1–7 sold, lot 8 open with bids, 9–12 pending.
 */
async function patchedPhase() {
  const init = () => {
    const orig = window.structuredClone
    window.structuredClone = (v, o) => {
      const c = orig(v, o)
      try {
        if (c && c.tournament && c.tournament.id === 'fx-full' && Array.isArray(c.calcuttaLots)) {
          c.tournament.status = 'auction'
          c.tournament.currentRoundId = null
          c.rounds = c.rounds.map((r) => ({ ...r, status: 'scheduled' }))
          c.scores = []
          c.cardSignatures = []
          c.snakeTiebreaks = []
          c.handicapOverrides = []
          c.pairs = []
          c.groups = []
          const soldN = 7
          c.calcuttaLots = c.calcuttaLots.map((l, i) => (i < soldN ? l : { ...l, status: i === soldN ? 'open' : 'pending', price: null, ownerId: null, soldAt: null }))
          const openLot = c.calcuttaLots[soldN]
          const keep = new Set(c.calcuttaLots.slice(0, soldN).map((l) => l.id))
          c.calcuttaBids = c.calcuttaBids.filter((b) => keep.has(b.lotId))
          c.calcuttaBuybacks = c.calcuttaBuybacks.filter((b) => keep.has(b.lotId))
          const others = c.players.map((p) => p.id).filter((id) => id !== openLot.playerId)
          ;[750, 1000, 1500].forEach((amount, i) => c.calcuttaBids.push({ id: `pbid${i}`, lotId: openLot.id, bidderId: others[i * 3 % others.length], amount, createdAt: new Date(Date.UTC(2027, 3, 9, 3, 10, i * 20)).toISOString() }))
        }
      } catch (e) {
        console.error('patch failed', e)
      }
      return c
    }
  }
  const out = []
  const fx = 'full12-live'
  const SYN = 'SYNTHETIC: full12-live rewritten in the browser (structuredClone hook) to status «auction», lots 1–7 sold, lot 8 open with 3 bids ($750→$1,500), lots 9–12 pending, no pairs/groups/scores; not a shipped fixture'
  // TV auction board.
  let page = await newPage('tv', { init, reducedMotion: 'no-preference' })
  let url = `/t/_/${fx}/tv`
  await go(page, url, { extra: 1200 })
  out.push(await capture(page, { url, device: 'tv', fixture: fx, route: 't_tv', state: 'patched-auction', file: `t_tv-${fx}-tv-dark-patched-auction.png` }, { extraObs: [SYN] }))
  await page.context().close()
  // Auctioneer console mid-lot, laptop and phone.
  for (const device of ['laptop', '15pro']) {
    page = await newPage(device, { init })
    url = `/t/_/${fx}/admin/calcutta`
    await go(page, url)
    out.push(await capture(page, { url, device, fixture: fx, route: 't_admin_calcutta', state: 'patched-midlot', file: `t_admin_calcutta-${fx}-${device}-light-patched-midlot.png` }, { extraObs: [SYN] }))
    const tile = page.locator('[role=radiogroup] [role=radio]:not([disabled])').nth(2)
    if (await tile.count()) {
      await tile.click()
      await settle(page, 400)
      out.push(await capture(page, { url, device, fixture: fx, route: 't_admin_calcutta', state: 'patched-midlot-bidder', file: `t_admin_calcutta-${fx}-${device}-light-patched-midlot-bidder.png` }, { extraObs: [SYN, 'a bidder tile selected: bid buttons enabled'] }))
      out.push(await capture(page, { url, device, fixture: fx, route: 't_admin_calcutta', state: 'patched-midlot-bidder-full', file: `t_admin_calcutta-${fx}-${device}-light-patched-midlot-bidder-full.png` }, { full: true, extraObs: [SYN] }))
    }
    await page.context().close()
  }
  // The pairs draw as it would look on Calcutta night (no pairs yet).
  page = await newPage('laptop', { init })
  url = `/t/_/${fx}/admin/parejas`
  await go(page, url)
  out.push(await capture(page, { url, device: 'laptop', fixture: fx, route: 't_admin_parejas', state: 'patched-nopairs', file: `t_admin_parejas-${fx}-laptop-light-patched-nopairs.png` }, { extraObs: [SYN] }))
  await page.context().close()
  return out
}
