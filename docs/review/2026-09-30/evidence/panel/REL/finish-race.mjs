// Round finished while phones hold queued scores. Player D (non-admin) and Nico (admin player) queue a hole
// offline; the Comité finishes round 2; both reconnect. Round 2 is set back to live at the end.
import { readFileSync, writeFileSync } from 'node:fs'
import { launch, newPhone, E, BASE, sleep, bridgeRealtime, rest, SB_URL, ANON, STORAGE_KEY } from './lib.mjs'

const R2 = 'a1852b80-3a0b-4148-8853-b630432dfd0e'
const jwtOf = (name) => JSON.parse(JSON.parse(readFileSync(`${E}/state/${name}.json`, 'utf8')).origins.find((o) => o.origin === BASE).localStorage.find((x) => x.name === STORAGE_KEY).value).access_token
const nicoJwt = jwtOf('nico-A')
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a)
const setStatus = async (status) => {
  const r = await fetch(`${SB_URL}/rest/v1/rounds?id=eq.${R2}`, { method: 'PATCH', headers: { apikey: ANON, Authorization: `Bearer ${nicoJwt}`, 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify({ status }) })
  return `${r.status} ${JSON.stringify((await r.json()).map((x) => x.status))}`
}
const holeRows = async (hole) => (await rest(`scores?round_id=eq.${R2}&hole=eq.${hole}&select=player_id,strokes,putts,entered_by,disputed&order=player_id`, nicoJwt)).body.map((r) => `${r.player_id.slice(0, 4)}:${r.strokes}@${r.entered_by?.slice(0, 4)}${r.disputed ? '!' : ''}`)
const idbCounts = (page) =>
  page.evaluate(
    () =>
      new Promise((res) => {
        const req = indexedDB.open('cardi-golf-outbox')
        req.onsuccess = () => {
          const db = req.result
          const tx = db.transaction(['items', 'rejected'])
          const a = tx.objectStore('items').count()
          const b = tx.objectStore('rejected').count()
          tx.oncomplete = () => res({ items: a.result, rejected: b.result })
        }
        req.onerror = () => res(null)
      }),
  )

log('round 2 status now:', (await rest(`rounds?id=eq.${R2}&select=status`, nicoJwt)).body[0].status)
log('before: hole 11', JSON.stringify(await holeRows(11)), 'hole 10', JSON.stringify(await holeRows(10)))
const b = await launch()
const mk = async (state) => {
  const ctx = await newPhone(b, `${E}/state/${state}.json`)
  await bridgeRealtime(ctx, { fixJoin: true })
  const page = await ctx.newPage()
  return { ctx, page }
}
const D = await mk('playerD')
const N = await mk('nico-A')
await D.page.goto(`${BASE}/t/ensayo/tarjeta?hoyo=11`, { waitUntil: 'domcontentloaded' })
await N.page.goto(`${BASE}/t/ensayo/tarjeta?hoyo=10`, { waitUntil: 'domcontentloaded' })
for (const p of [D.page, N.page]) await p.getByRole('button', { name: /^Guardar (hoyo|y ver la tarjeta)$/ }).waitFor({ timeout: 60000 })
await sleep(2000)
// Queue offline.
await D.ctx.setOffline(true)
await N.ctx.setOffline(true)
await D.page.locator('button[aria-label="Golpes: más"]').nth(0).click()
await D.page.locator('button[aria-label="Golpes: más"]').nth(2).click()
await D.page.getByRole('button', { name: /^Guardar (hoyo|y ver la tarjeta)$/ }).click()
await N.page.locator('button[aria-label="Golpes: más"]').nth(1).click()
await N.page.getByRole('button', { name: /^Guardar (hoyo|y ver la tarjeta)$/ }).click()
await sleep(1500)
log('queued offline: D', JSON.stringify(await idbCounts(D.page)), 'Nico', JSON.stringify(await idbCounts(N.page)))
// The Comité finishes the round (as AdminRounds does: rounds.update({status})).
log('finish round 2 →', await setStatus('finished'))
try {
  // D reconnects.
  await D.ctx.setOffline(false)
  await sleep(9000)
  log('D after reconnect: outbox', JSON.stringify(await idbCounts(D.page)))
  log('D Tarjeta text:', JSON.stringify((await D.page.locator('main').first().innerText()).split('\n').slice(0, 8)))
  await D.page.screenshot({ path: `${E}/shots/finish-race-D-tarjeta.png` })
  await D.page.goto(`${BASE}/t/ensayo`, { waitUntil: 'domcontentloaded' })
  await D.page.waitForSelector('text=Individual', { timeout: 30000 })
  await sleep(1500)
  const dLive = await D.page.locator('main').first().innerText()
  log('D En vivo mentions rechaz*:', /rechaz/i.test(dLive), 'header:', JSON.stringify(await D.page.locator('header').first().innerText()))
  await D.page.goto(`${BASE}/t/ensayo/tarjeta`, { waitUntil: 'domcontentloaded' })
  await sleep(3000)
  log('D Tarjeta after reload:', JSON.stringify((await D.page.locator('main').first().innerText()).split('\n').slice(0, 6)), 'outbox', JSON.stringify(await idbCounts(D.page)))
  // Nico reconnects.
  await N.ctx.setOffline(false)
  await sleep(9000)
  log('Nico after reconnect: outbox', JSON.stringify(await idbCounts(N.page)))
  log('server after: hole 11', JSON.stringify(await holeRows(11)), 'hole 10', JSON.stringify(await holeRows(10)))
  log('round 2 status during:', (await rest(`rounds?id=eq.${R2}&select=status`, nicoJwt)).body[0].status)
} finally {
  log('restore round 2 →', await setStatus('live'))
}
await b.close()
