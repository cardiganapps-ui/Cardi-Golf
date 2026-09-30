// App opened ONLINE (normal live load, valid token), then the signal goes and the access token expires while the
// app stays open (simulated by moving expires_at in storage: auth-js re-reads storage on every getSession), a hole is
// queued offline, and the signal returns at <onlineAt> s. Question: what identity do the queued writes carry?
// usage: node livethenoffline.mjs <label> <offlineAtSec> <onlineAtSec> <watchSec>
import { openPersistent, cloneProfile, E, BASE, STORAGE_KEY, SB_HOST, ANON, sleep, jwtInfo, storedSession, idbCounts, screenState, readFileSync, writeFileSync } from './v10lib.mjs'

const [label, offArg, onArg, watchArg] = process.argv.slice(2)
const offAt = Number(offArg) * 1000
const onAt = Number(onArg) * 1000
const watch = Number(watchArg) * 1000
const runDir = `${E}/profiles/run-${label}`
cloneProfile(`${E}/profiles/golden`, runDir)
const sess = JSON.parse(readFileSync(`${E}/state/session.json`, 'utf8'))
const origUser = jwtInfo(sess.access_token).sub
const ctx = await openPersistent(runDir)
await ctx.addInitScript(
  ([k, v]) => {
    if (!sessionStorage.getItem('v10-init')) {
      localStorage.setItem(k, v)
      sessionStorage.setItem('v10-init', '1')
    }
  },
  [STORAGE_KEY, JSON.stringify(sess)],
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
const who = (h) => {
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
  net.push({ t: Number(rel()), ev: 'req', m: r.method(), path: u.split(SB_HOST)[1].split('?')[0] + (u.includes('grant_type=refresh_token') ? '?refresh' : ''), auth: who(r.headers()) })
})
page.on('requestfailed', (r) => {
  const u = r.url()
  if (u.includes(SB_HOST)) net.push({ t: Number(rel()), ev: 'fail', m: r.method(), path: u.split(SB_HOST)[1].split('?')[0], err: r.failure()?.errorText })
})
page.on('response', (r) => {
  const u = r.url()
  if (u.includes(SB_HOST)) net.push({ t: Number(rel()), ev: 'res', m: r.request().method(), path: u.split(SB_HOST)[1].split('?')[0], status: r.status() })
})
tNav = Date.now()
L(`run ${label}: live open, offline at ${offAt / 1000}s (token expires then), online at ${onAt / 1000}s, user=${origUser}`)
await page.goto(`${BASE}/t/ensayo`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('text=Individual', { timeout: 60000 })
L('live board:', JSON.stringify(await screenState(page)))
let wentOff = false
let wentOn = false
let last = ''
while (Date.now() - tNav < watch) {
  if (!wentOff && Date.now() - tNav >= offAt) {
    wentOff = true
    await ctx.setOffline(true)
    await page.evaluate((k) => {
      const s = JSON.parse(localStorage.getItem(k))
      s.expires_at = Math.floor(Date.now() / 1000) - 60
      localStorage.setItem(k, JSON.stringify(s))
    }, STORAGE_KEY)
    L('>>> OFFLINE; stored access token now expired')
    await page.getByRole('link', { name: 'Tarjeta', exact: true }).click()
    const save = page.getByRole('button', { name: /^Guardar (hoyo|y ver la tarjeta)$/ })
    await save.waitFor({ timeout: 20000 })
    await sleep(800)
    const hole = await page.locator('[class*="holeNum"]').first().innerText({ timeout: 2000 }).catch(() => '?')
    await save.click()
    await sleep(500)
    const sure = page.getByRole('button', { name: 'Sí, así fue' })
    if (await sure.count()) await sure.click().catch(() => undefined)
    await sleep(1200)
    L('queued offline (hole', hole, '):', JSON.stringify(await idbCounts(page)))
    await page.getByRole('link', { name: 'En vivo', exact: true }).click()
  }
  if (!wentOn && Date.now() - tNav >= onAt) {
    wentOn = true
    const tok = net.filter((n) => n.ev === 'req' && /token/.test(n.path)).map((n) => n.t)
    L('>>> ONLINE; refresh attempts so far at', JSON.stringify(tok), 'outbox', JSON.stringify(await idbCounts(page)))
    await ctx.setOffline(false)
  }
  const st = await screenState(page)
  const sig = JSON.stringify({ hdr: st.hdr, enter: st.enter })
  if (sig !== last) {
    L('screen', sig)
    last = sig
  }
  await sleep(250)
}
const after = await storedSession(page)
const afterUser = after?.access_token ? jwtInfo(after.access_token).sub : null
L('END outbox', JSON.stringify(await idbCounts(page)), 'session user', afterUser, afterUser === origUser ? '(same)' : '(DIFFERENT/none)')
const chipTxt = await page.getByRole('link', { name: 'Tarjeta', exact: true }).click().then(() => sleep(1500)).then(() => page.locator('body').innerText()).catch(() => '')
L('tarjeta after:', JSON.stringify(chipTxt.split('\n').filter((l) => /rechaz|pendient|Sincroniz|Descartar|Reenviar/i.test(l)).slice(0, 6)))
await page.screenshot({ path: `${E}/shots/${label}-end.png` })
if (afterUser === origUser && after.refresh_token !== sess.refresh_token) {
  writeFileSync(`${E}/state/session.json`, JSON.stringify(after))
  L('session rotated; saved')
}
writeFileSync(`${E}/logs/${label}.net.json`, JSON.stringify(net))
writeFileSync(`${E}/logs/${label}.log`, out.join('\n') + '\n')
console.log(
  'NET after online:',
  net
    .filter((n) => n.t >= onAt / 1000 - 0.5 && /scores|token|signup|rpc\/(lookup|my_membership)/.test(n.path))
    .map((n) => `${n.t}:${n.ev}:${n.m}:${n.path.replace('/rest/v1/', '')}${n.auth ? ':' + n.auth : ''}${n.status ? ':' + n.status : ''}${n.err ? ':' + n.err : ''}`)
    .slice(0, 40)
    .join(' | '),
)
await ctx.close()
