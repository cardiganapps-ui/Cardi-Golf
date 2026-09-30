// Multi-device race on one hole of group 3 (round 2). The hole's four rows are deleted first so every
// phone opens it unplayed (par defaults), as on the course. Each phone changes some players and saves;
// the saves start within `stagger` ms of each other. Then: server rows, audit, each phone's display.
// usage: node race.mjs <hole> <fixJoin:0|1> <spec> [stagger]
//   spec = semicolon list of phones: "<stateName>:<playerIdx>=<delta>,<playerIdx>=<delta>"
//   e.g. "nico-A:2=1,3=1;playerD:0=1,1=-1"
import { readFileSync, writeFileSync } from 'node:fs'
import { launch, newPhone, E, BASE, sleep, bridgeRealtime, rest, rpc, SB_URL, ANON, STORAGE_KEY } from './lib.mjs'

const HOLE = Number(process.argv[2])
const FIX = process.argv[3] === '1'
const spec = process.argv[4].split(';').map((p) => {
  const [state, ch] = p.split(':')
  return { state, changes: ch ? ch.split(',').map((c) => c.split('=').map(Number)) : [] }
})
const STAGGER = Number(process.argv[5] ?? 300)
const R2 = 'a1852b80-3a0b-4148-8853-b630432dfd0e'
const G3 = ['962ab37f-1f8e-43ea-b896-ede86866df40', 'd654c4ed-4045-4fb6-bfb4-b4d1df9746d5', 'e507cf3c-f6c5-45ca-ae20-8c548ba68230', 'e914de60-39b7-4d6f-a3d1-6f52584fa2fb']
const jwtOf = (name) => JSON.parse(JSON.parse(readFileSync(`${E}/state/${name}.json`, 'utf8')).origins.find((o) => o.origin === BASE).localStorage.find((x) => x.name === STORAGE_KEY).value).access_token
const nicoJwt = jwtOf('nico-A')
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a)

// Group order as the app shows it.
const g = (await rest(`groups?round_id=eq.${R2}&number=eq.3&select=id,group_members(player_id)`, nicoJwt)).body[0]
log('group 3 id', g.id.slice(0, 8))
// Clear the hole (4 rows) so it is unplayed everywhere.
const del = await fetch(`${SB_URL}/rest/v1/scores?round_id=eq.${R2}&hole=eq.${HOLE}&player_id=in.(${G3.join(',')})`, { method: 'DELETE', headers: { apikey: ANON, Authorization: `Bearer ${nicoJwt}`, Prefer: 'return=representation' } })
log('cleared hole', HOLE, 'status', del.status, 'rows', (await del.json()).length)

const b = await launch()
const phones = []
for (const [i, p] of spec.entries()) {
  const ctx = await newPhone(b, `${E}/state/${p.state}.json`)
  await bridgeRealtime(ctx, { fixJoin: FIX, delayMs: 40 })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => log('P' + (i + 1), 'pageerror', String(e).slice(0, 160)))
  await page.goto(`${BASE}/t/ensayo/tarjeta?hoyo=${HOLE}`, { waitUntil: 'domcontentloaded' })
  phones.push({ ...p, page, name: `P${i + 1}(${p.state})` })
}
for (const ph of phones) await ph.page.getByRole('button', { name: /^Guardar (hoyo|y ver la tarjeta)$/ }).waitFor({ timeout: 60000 })
await sleep(2500)
const names = await phones[0].page.locator('[class*="playerNameText"]').allInnerTexts()
log('player order in the Tarjeta: idx 0..3 (names withheld), count', names.length)
// Apply each phone's edits.
for (const ph of phones) {
  for (const [idx, delta] of ph.changes) {
    const btn = ph.page.locator(`button[aria-label="Golpes: ${delta > 0 ? 'más' : 'menos'}"]`).nth(idx)
    for (let k = 0; k < Math.abs(delta); k++) await btn.click()
  }
}
const drafts = {}
for (const ph of phones) {
  drafts[ph.name] = await ph.page.evaluate(() => [...document.querySelectorAll('[class*="controls"]')].map((c) => c.querySelector('output, [class*="value"], [aria-live]')?.textContent ?? c.textContent.replace(/\s+/g, ' ').slice(0, 24)))
}
log('drafts per phone (strokes controls text):', JSON.stringify(drafts))
// Save within the stagger window.
const t0 = Date.now()
await Promise.all(
  phones.map(async (ph, i) => {
    await sleep(i * STAGGER)
    ph.clickAt = Date.now() - t0
    await ph.page.getByRole('button', { name: /^Guardar (hoyo|y ver la tarjeta)$/ }).click()
  }),
)
log('clicks at ms:', phones.map((p) => `${p.name}@${p.clickAt}`).join(' '))
await sleep(9000)
// Server truth.
const rows = (await rest(`scores?round_id=eq.${R2}&hole=eq.${HOLE}&select=id,player_id,strokes,putts,entered_by,disputed,previous,client_ts,updated_at&order=player_id`, nicoJwt)).body
const idxOf = (pid) => g.group_members.findIndex((m) => m.player_id === pid)
log('server rows:', JSON.stringify(rows.map((r) => ({ p: r.player_id.slice(0, 4), strokes: r.strokes, by: r.entered_by?.slice(0, 4), disputed: r.disputed, prev: r.previous ? `${r.previous.strokes}@${String(r.previous.entered_by).slice(0, 4)}` : null }))))
// What each phone shows (grid) without any reload.
const showGrid = async (ph) => {
  const view = ph.page.getByRole('button', { name: 'Ver tarjeta' })
  if (await view.count()) await view.click()
  await ph.page.waitForSelector('table', { timeout: 15000 })
  await sleep(400)
  return ph.page.evaluate((hole) => {
    const tr = [...document.querySelectorAll('table tr')].find((x) => x.querySelector('td button')?.textContent?.trim() === String(hole))
    return tr ? [...tr.querySelectorAll('td')].slice(3).map((td) => td.textContent.trim()) : null
  }, HOLE)
}
for (const ph of phones) log(ph.name, 'shows (no reload):', JSON.stringify(await showGrid(ph)), 'chip:', JSON.stringify(await ph.page.locator('[class*="saveStatus"]').first().innerText().catch(() => '?')))
// After a reload.
for (const ph of phones) {
  await ph.page.goto(`${BASE}/t/ensayo/tarjeta?hoyo=${HOLE}`, { waitUntil: 'domcontentloaded' })
  await ph.page.getByRole('button', { name: /^Guardar (hoyo|y ver la tarjeta)$/ }).waitFor({ timeout: 60000 })
  await sleep(1500)
  log(ph.name, 'shows after reload:', JSON.stringify(await showGrid(ph)))
}
await phones[0].page.screenshot({ path: `${E}/shots/race-h${HOLE}-P1-after-reload.png` })
// Audit trail for the hole's rows.
const audit = (await rpc('tournament_audit', { p_tournament_id: '8b40f02b-e8be-4cd7-a93a-b42d450f5fda', p_before: null, p_limit: 60 }, nicoJwt)).body
const ids = new Set(rows.map((r) => r.id))
const mine = Array.isArray(audit) ? audit.filter((a) => a.table === 'scores' && ids.has(a.rowId)) : audit
log('audit entries for these rows:', Array.isArray(mine) ? mine.length : JSON.stringify(mine).slice(0, 200))
if (Array.isArray(mine))
  for (const a of mine.slice(0, 16)) log('  ', a.at.slice(11, 23), a.action, 'actorKnown=' + !!a.actor, 'before', a.before ? `${a.before.strokes}@${String(a.before.entered_by).slice(0, 4)}` : null, 'after', a.after ? `${a.after.strokes}@${String(a.after.entered_by).slice(0, 4)} disputed=${a.after.disputed}` : null)
writeFileSync(`${E}/logs/race-h${HOLE}-${Date.now()}.json`, JSON.stringify({ spec, rows, drafts, audit: mine }, null, 1))
await b.close()
