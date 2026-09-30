// V9 / REL-05, write-free: the real Tarjeta (HEAD build on :4209, production Supabase, Ensayo, Nico's phone).
// Every write to Supabase is intercepted and answered locally (nothing reaches the server); the snapshot's
// score rows for (round 2, hole H, group 3) are rewritten in the GET responses to play the other phone:
//   phase A: hole H is unplayed (group 3's rows removed) -> the Tarjeta opens with par/2 defaults
//   phase B: the other phone (player D, keeping Nico's pair = idx 0,2) "saves": its rows appear on the next
//            snapshot fetch, triggered by an `online` event (the same reload Realtime or a foreground would do)
//   then Nico's phone enters ONLY the rival pair (idx 1,3), per «Llevas la tarjeta de», and taps «Guardar hoyo».
// Records: steppers before/after the reload, the grid cell for hole H, and every intercepted write body.
// usage: NODE_USE_ENV_PROXY=1 node tarjeta-race.mjs [hole]
import { readFileSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright-core'
import { createClient } from '@supabase/supabase-js'

const V = '/tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad/verify/evidence/V9'
const BASE = 'http://127.0.0.1:4209'
const env = readFileSync('/home/user/Cardi-Golf/.env.example', 'utf8')
const URL_ = /VITE_SUPABASE_URL=(\S+)/.exec(env)[1]
const ANON = /VITE_SUPABASE_ANON_KEY=(\S+)/.exec(env)[1]
const ENSAYO = '8b40f02b-e8be-4cd7-a93a-b42d450f5fda'
const NICO = '962ab37f-1f8e-43ea-b896-ede86866df40'
const R2 = 'a1852b80-3a0b-4148-8853-b630432dfd0e'
const GROUP3 = ['962ab37f', 'd654', 'e507', 'e914'] // prefixes; resolved below
const H = Number(process.argv[2] ?? 15)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const out = { hole: H, log: [], writes: [], blocked: [], rpc: [] }
const log = (...a) => {
  const line = [new Date().toISOString().slice(11, 23), ...a].join(' ')
  out.log.push(line)
  console.log(line)
}

// ---- session (the one anonymous user from rt-subscribe.mjs), claim Nico ----
const sessFile = `${V}/anon-session.json`
let session = JSON.parse(readFileSync(sessFile, 'utf8'))
if (session.expires_at * 1000 < Date.now() + 15 * 60_000) {
  const sb0 = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await sb0.auth.refreshSession({ refresh_token: session.refresh_token })
  if (error) throw error
  session = data.session
  writeFileSync(sessFile, JSON.stringify(session))
  log('refreshed stored anonymous session')
}
let jwt = session.access_token
const H_ = () => ({ apikey: ANON, Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' })
const rpc = async (name, args) => {
  const r = await fetch(`${URL_}/rest/v1/rpc/${name}`, { method: 'POST', headers: H_(), body: JSON.stringify(args ?? {}) })
  return { status: r.status, body: await r.json().catch(() => null) }
}
const claim = await rpc('claim_player', { p_player_id: NICO, p_pin: '1234' })
log('claim_player', claim.status, claim.body?.ok)
if (!claim.body?.ok) process.exit(1)
const groups = await (await fetch(`${URL_}/rest/v1/groups?round_id=eq.${R2}&number=eq.3&select=id,start_hole`, { headers: H_() })).json()
const gid = groups[0].id
const members = (await (await fetch(`${URL_}/rest/v1/group_members?group_id=eq.${gid}&select=player_id&order=player_id`, { headers: H_() })).json()).map((m) => m.player_id)
const serverRows = async () => (await (await fetch(`${URL_}/rest/v1/scores?round_id=eq.${R2}&hole=eq.${H}&player_id=in.(${members.join(',')})&select=*&order=player_id`, { headers: H_() })).json())
const before = await serverRows()
const brief = (rows) => rows.map((r) => `${r.player_id.slice(0, 4)}:${r.strokes}/${r.putts}@${(r.entered_by ?? 'null').slice(0, 4)}${r.disputed ? '!' : ''}`)
log('group 3 members (sorted = Tarjeta order)', members.map((m) => m.slice(0, 4)).join(','), '| server rows hole', H, 'before:', JSON.stringify(brief(before)))

// ---- the other phone's save (player D keeps Nico's pair: idx 0 and 2), as its writeHole would send it ----
const D = members.find((m) => m.startsWith('d654'))
let otherPhoneSaved = false
let otherRows = []

// ---- browser ----
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2 })
await ctx.addInitScript(([k, v]) => {
  if (location.origin === 'http://127.0.0.1:4209' && !localStorage.getItem(k)) localStorage.setItem(k, v)
}, ['cardi-golf-auth', JSON.stringify(session)])
const READ_RPC = new Set(['lookup_tournament', 'my_membership', 'app_flags', 'players_with_pin', 'round_rivalries', 'tournament_profiles', 'my_links', 'unread_notifications', 'is_platform_admin'])
let scoreGets = 0
await ctx.route(/gmohwledjejlhcwqjnhd\.supabase\.co\//, async (route) => {
  const req = route.request()
  const u = new URL(req.url())
  const m = req.method()
  if (u.pathname.startsWith('/auth/v1/signup')) {
    out.blocked.push(`${m} ${u.pathname}`)
    return route.abort()
  }
  if (u.pathname.startsWith('/auth/v1/')) return route.continue()
  if (u.pathname.startsWith('/rest/v1/rpc/')) {
    const name = u.pathname.split('/').pop()
    out.rpc.push(name)
    if (READ_RPC.has(name)) return route.continue()
    out.blocked.push(`${m} rpc/${name}`)
    return route.abort()
  }
  if (u.pathname === '/rest/v1/scores' && m === 'GET') {
    const res = await route.fetch()
    let rows = await res.json()
    const isOurs = (r) => r.round_id === R2 && r.hole === H && members.includes(r.player_id)
    const real = rows.filter(isOurs)
    rows = rows.filter((r) => !isOurs(r))
    if (otherPhoneSaved) rows.push(...otherRows)
    else if (!otherRows.length && real.length) {
      // What player D's phone writes for hole H: its pair's card (Nico=idx0, e507=idx2) with real values,
      // and its untouched defaults for idx 1 and 3.
      const par = null
      otherRows = members.map((pid, i) => {
        const base = real.find((r) => r.player_id === pid) ?? real[0]
        return { ...base, player_id: pid, entered_by: D, client_ts: new Date().toISOString(), updated_at: new Date().toISOString(), disputed: false, previous: null, reason: null, _idx: i }
      })
    }
    scoreGets++
    return route.fulfill({ status: res.status(), headers: res.headers(), body: JSON.stringify(rows) })
  }
  if (m !== 'GET' && m !== 'HEAD' && m !== 'OPTIONS') {
    let body = null
    try {
      body = req.postDataJSON()
    } catch {
      body = req.postData()
    }
    out.writes.push({ at: Date.now(), method: m, path: u.pathname, query: u.search, body })
    return route.fulfill({ status: m === 'DELETE' ? 204 : 201, headers: { 'content-type': 'application/json' }, body: '' })
  }
  return route.continue()
})

const page = await ctx.newPage()
page.on('pageerror', (e) => log('pageerror', String(e).slice(0, 160)))
await page.goto(`${BASE}/t/ensayo/tarjeta?hoyo=${H}`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('text=Guardar hoyo', { timeout: 45000 })
await sleep(1500)
const holeNum = await page.locator('header').filter({ has: page.locator('button[aria-label="Hoyo anterior"]') }).innerText()
log('Tarjeta open; hole header:', JSON.stringify(holeNum.replace(/\s+/g, ' ')), '| keeping line present:', await page.locator('text=Llevas la tarjeta de').count())
const read = async () => {
  const s = await page.locator('[role=group][aria-label="Golpes"] [aria-live]').allInnerTexts()
  const p = await page.locator('[role=group][aria-label="Putts"] [aria-live]').allInnerTexts()
  return s.map((x, i) => `${x}/${p[i]}`)
}
const parOf = async () => Number((await page.locator('header').filter({ has: page.locator('button[aria-label="Hoyo anterior"]') }).innerText()).match(/Par (\d)/i)?.[1])
const par = await parOf()
log('phase A (hole unplayed on this phone) drafts idx0..3 strokes/putts:', JSON.stringify(await read()), 'par', par)

if (otherRows.length !== 4) {
  log('ABORT: could not build the other phone rows', otherRows.length)
  await browser.close()
  await rpc('release_device', {})
  process.exit(1)
}
// Real values the other phone recorded for Nico's pair: idx0 = par+1, idx2 = par+2 (2 putts each); its defaults for idx1, idx3.
otherRows = otherRows.map((r) => ({ ...r, strokes: r._idx === 0 ? par + 1 : r._idx === 2 ? par + 2 : par, putts: 2, picked_up: false }))
otherRows.forEach((r) => delete r._idx)
otherPhoneSaved = true
const getsBefore = scoreGets
await page.evaluate(() => window.dispatchEvent(new Event('online')))
for (let i = 0; i < 40 && scoreGets === getsBefore; i++) await sleep(250)
await sleep(1500)
log('phase B: other phone saved', JSON.stringify(otherRows.map((r) => `${r.player_id.slice(0, 4)}:${r.strokes}/${r.putts}@${r.entered_by.slice(0, 4)}`)), '| snapshot refetched:', scoreGets > getsBefore)
log('   drafts on this phone after the refetch:', JSON.stringify(await read()))
const ptsClasses = await page.locator('[class*="pts"]').evaluateAll((els) => els.map((e) => e.className).filter((c) => /pts/.test(c)).slice(0, 4))
log('   points-badge classes (muted = still treated as unplayed):', JSON.stringify(ptsClasses.map((c) => (/Muted/.test(c) ? 'muted' : 'live'))))
await page.click('text=Ver tarjeta')
await sleep(800)
const gridRow = await page.locator('table tbody tr').filter({ has: page.locator(`button:text-is("${H}")`) }).first().innerText()
log(`   grid row for hole ${H} (from the snapshot):`, JSON.stringify(gridRow.replace(/\s+/g, ' ')))
await page.click('text=Ver hoyo')
await sleep(800)
log('   back on the hole view, drafts:', JSON.stringify(await read()))

// Nico's phone keeps the rival pair's card: touch ONLY idx 1 (one under par) and idx 3 (one over), leave idx 0 and 2.
const minus = page.locator('[role=group][aria-label="Golpes"] button[aria-label="Golpes: menos"]')
const plus = page.locator('[role=group][aria-label="Golpes"] button[aria-label="Golpes: más"]')
await minus.nth(1).click()
await plus.nth(3).click()
log('this phone touched idx1 and idx3 only; drafts now:', JSON.stringify(await read()))
const w0 = out.writes.length
await page.click('text=Guardar hoyo')
for (let i = 0; i < 40 && out.writes.length < w0 + 4; i++) await sleep(250)
await sleep(1000)
const scoreWrites = out.writes.slice(w0).filter((w) => w.path === '/rest/v1/scores')
log('intercepted score writes on «Guardar hoyo»:', scoreWrites.length)
for (const w of scoreWrites) {
  const b = Array.isArray(w.body) ? w.body[0] : w.body
  const i = members.indexOf(b.player_id)
  const other = otherRows.find((r) => r.player_id === b.player_id)
  log(`   ${w.method} idx${i} ${b.player_id.slice(0, 4)} hole ${b.hole}: strokes ${b.strokes} putts ${b.putts} entered_by ${String(b.entered_by).slice(0, 4)}  | other phone had ${other.strokes}/${other.putts}${other.strokes !== b.strokes ? '  <- OVERWRITTEN' : ''}`)
}
log('other writes intercepted:', JSON.stringify(out.writes.slice(w0).filter((w) => w.path !== '/rest/v1/scores').map((w) => `${w.method} ${w.path}`)), '| blocked:', JSON.stringify(out.blocked), '| rpc seen:', JSON.stringify([...new Set(out.rpc)]))
await page.screenshot({ path: `${V}/tarjeta-race-after-save.png` })
// keep the page's (possibly refreshed) session for later calls
const pageSess = await page.evaluate(() => localStorage.getItem('cardi-golf-auth'))
if (pageSess) {
  session = JSON.parse(pageSess)
  writeFileSync(sessFile, JSON.stringify(session))
  jwt = session.access_token
}
await browser.close()
const after = await serverRows()
log('server rows hole', H, 'after:', JSON.stringify(brief(after)), '| unchanged:', JSON.stringify(before) === JSON.stringify(after))
const rel = await rpc('release_device', {})
log('release_device', rel.status, 'membership', JSON.stringify((await rpc('my_membership', { tid: ENSAYO })).body?.playerId ?? null))
writeFileSync(`${V}/tarjeta-race-result.json`, JSON.stringify(out, null, 1))
process.exit(0)
