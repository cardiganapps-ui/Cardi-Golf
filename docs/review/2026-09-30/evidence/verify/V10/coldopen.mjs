// Cold open of /t/ensayo from a persistent profile that holds the SW shell + cached snapshot.
// usage: node coldopen.mjs <label> <mode: offline|liefi|liefi-cdp> <expired: 0|1> <onlineAtSec|0> <watchSec> [queue]
//  - expired=1: stored session's expires_at set 60 s in the past (the access token is treated as expired by auth-js);
//    expired=0: expires_at = now + 1 h.
//  - onlineAtSec: when the network comes back (offline: setOffline(false); liefi: requests start being answered).
//  - queue: once the cached board shows, save the current hole on the Tarjeta (unchanged values) so the outbox holds items.
import { openPersistent, cloneProfile, E, BASE, STORAGE_KEY, SB_HOST, ANON, sleep, jwtInfo, storedSession, idbCounts, screenState, readFileSync, writeFileSync } from './v10lib.mjs'

const [label, mode, expiredArg, onlineAtArg, watchArg, queueArg] = process.argv.slice(2)
const expired = expiredArg === '1'
const onlineAt = Number(onlineAtArg || 0) * 1000
const watch = Number(watchArg || 60) * 1000
const queue = queueArg === 'queue'
const runDir = `${E}/profiles/run-${label}`
cloneProfile(`${E}/profiles/golden`, runDir)
const sess = JSON.parse(readFileSync(`${E}/state/session.json`, 'utf8'))
const origUser = jwtInfo(sess.access_token).sub
const inject = { ...sess, expires_at: expired ? Math.floor(Date.now() / 1000) - 60 : Math.floor(Date.now() / 1000) + 3600 }

const ctx = await openPersistent(runDir)
await ctx.addInitScript(
  ([k, v]) => {
    if (!sessionStorage.getItem('v10-init')) {
      localStorage.setItem(k, v)
      sessionStorage.setItem('v10-init', '1')
    }
  },
  [STORAGE_KEY, JSON.stringify(inject)],
)
const page = ctx.pages()[0] ?? (await ctx.newPage())
let tNav = Date.now()
const rel = () => ((Date.now() - tNav) / 1000).toFixed(2)
const out = []
const L = (...a) => {
  const line = `[t=${rel().padStart(6)}s] ${a.join(' ')}`
  out.push(line)
  console.log(line)
}
const net = []
const describeAuth = (h) => {
  const a = h['authorization']
  if (!a) return 'none'
  const j = a.replace(/^Bearer /, '')
  if (j === ANON) return 'ANON-KEY'
  const i = jwtInfo(j)
  return i ? `${i.role}:${i.sub}` : '?'
}
page.on('request', (r) => {
  const u = r.url()
  if (!u.includes(SB_HOST)) return
  const path = u.split(SB_HOST)[1].split('?')[0]
  const q = u.includes('grant_type=refresh_token') ? '?refresh' : ''
  net.push({ t: Number(rel()), ev: 'req', m: r.method(), path: path + q, auth: describeAuth(r.headers()) })
})
page.on('requestfailed', (r) => {
  const u = r.url()
  if (!u.includes(SB_HOST)) return
  net.push({ t: Number(rel()), ev: 'fail', m: r.method(), path: u.split(SB_HOST)[1].split('?')[0], err: r.failure()?.errorText })
})
page.on('response', (r) => {
  const u = r.url()
  if (!u.includes(SB_HOST)) return
  net.push({ t: Number(rel()), ev: 'res', m: r.request().method(), path: u.split(SB_HOST)[1].split('?')[0], status: r.status() })
})

// Network conditions for the cold open.
let cdp = null
if (mode === 'offline') await ctx.setOffline(true)
if (mode === 'liefi') await ctx.route(`https://${SB_HOST}/**`, () => undefined) // connected, nothing ever answers
if (mode === 'liefi-cdp') {
  cdp = await ctx.newCDPSession(page)
  await cdp.send('Network.enable')
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 60000, downloadThroughput: -1, uploadThroughput: -1 })
}
tNav = Date.now()
L(`run ${label}: mode=${mode} expired=${expired} onlineAt=${onlineAt / 1000}s watch=${watch / 1000}s queue=${queue} user=${origUser}`)
await page.goto(`${BASE}/t/ensayo`, { waitUntil: 'domcontentloaded' }).catch((e) => L('goto error', e.message.slice(0, 100)))
let boardAt = null
let last = ''
let queued = false
let wentOnline = false
const VIS_AT = Number(process.env.VIS_AT || 0) * 1000
const FLAP_AT = Number(process.env.FLAP_AT || 0) * 1000
let visDone = false
let flapDone = false
while (Date.now() - tNav < watch) {
  if (VIS_AT && !visDone && Date.now() - tNav >= VIS_AT) {
    visDone = true
    // What an app switch does to listeners: a visibilitychange while visible (hidden→visible can't be emulated headless).
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
    L('>>> visibilitychange dispatched')
  }
  if (FLAP_AT && !flapDone && Date.now() - tNav >= FLAP_AT) {
    flapDone = true
    await ctx.setOffline(true)
    await sleep(1500)
    await ctx.setOffline(false)
    L('>>> second offline→online flap')
  }
  if (!wentOnline && onlineAt && Date.now() - tNav >= onlineAt) {
    wentOnline = true
    if (mode === 'offline') await ctx.setOffline(false)
    if (mode === 'liefi') await ctx.unroute(`https://${SB_HOST}/**`)
    if (mode === 'liefi-cdp') await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 })
    L('>>> NETWORK BACK', JSON.stringify(await idbCounts(page)))
  }
  const st = await screenState(page)
  const sig = JSON.stringify({ hdr: st.hdr, board: st.board, enter: st.enter, spin: !st.hdr && !st.enter ? st.body.slice(0, 40) : undefined })
  if (sig !== last) {
    L('screen', sig)
    last = sig
  }
  if (st.board && boardAt == null) {
    boardAt = Number(rel())
    L(`BOARD VISIBLE after ${boardAt}s`)
    await page.screenshot({ path: `${E}/shots/${label}-board.png` })
  }
  if (queue && st.board && !queued && !wentOnline) {
    queued = true
    try {
      await page.getByRole('link', { name: 'Tarjeta', exact: true }).click()
      const save = page.getByRole('button', { name: /^Guardar (hoyo|y ver la tarjeta)$/ })
      await save.waitFor({ timeout: 20000 })
      await sleep(800)
      const holeTxt = await page.locator('[class*="holeNum"]').first().innerText({ timeout: 2000 }).catch(() => '?')
      await save.click()
      const sure = page.getByRole('button', { name: 'Sí, así fue' })
      await sleep(500)
      if (await sure.count()) await sure.click().catch(() => undefined)
      await sleep(1200)
      L('queued offline (hole', holeTxt, '):', JSON.stringify(await idbCounts(page)), 'chip:', JSON.stringify(await page.locator('[class*="saveStatus"]').first().innerText({ timeout: 2000 }).catch(() => '?')))
      await page.screenshot({ path: `${E}/shots/${label}-queued.png` })
      await page.getByRole('link', { name: 'En vivo', exact: true }).click()
      await sleep(500)
    } catch (e) {
      L('queue step failed:', String(e).slice(0, 200))
    }
  }
  await sleep(250)
}
const after = await storedSession(page)
const afterUser = after?.access_token ? jwtInfo(after.access_token).sub : null
L('END outbox', JSON.stringify(await idbCounts(page)), 'stored session user', afterUser, afterUser === origUser ? '(same user)' : '(DIFFERENT user or none)')
L('final screen', JSON.stringify(await screenState(page)))
await page.screenshot({ path: `${E}/shots/${label}-end.png` })
// Carry a rotated session forward (same user only) so later runs never reuse a spent refresh token.
if (afterUser === origUser && after.refresh_token !== sess.refresh_token) {
  writeFileSync(`${E}/state/session.json`, JSON.stringify(after))
  L('session rotated; saved for the next run')
}
writeFileSync(`${E}/logs/${label}.net.json`, JSON.stringify(net, null, 0))
writeFileSync(`${E}/logs/${label}.log`, out.join('\n') + '\n')
// Compact network timeline for the log.
const compact = net.filter((n) => n.ev !== 'res' || n.status >= 300 || /rpc|signup|token/.test(n.path)).map((n) => `${n.t}:${n.ev}:${n.m}:${n.path}${n.auth ? ':' + n.auth : ''}${n.status ? ':' + n.status : ''}${n.err ? ':' + n.err : ''}`)
console.log('NET', compact.slice(0, 200).join(' | '))
await ctx.close()
