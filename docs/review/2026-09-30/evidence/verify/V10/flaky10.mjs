// REL-10 probe. Live board (Realtime socket bridged so the header behaves as on a phone), then REST failures injected.
// A «remote change» is simulated without writing anything: once `marker` is on, every successful GET of the
// tournaments row is answered with the captured row whose name ends in « ✱», so the header shows ✱ as soon as
// a snapshot reload completes.
// usage: node flaky10.mjs <label> <burst|burstws|random10|alternate>
import { openPersistent, cloneProfile, E, BASE, STORAGE_KEY, SB_HOST, sleep, jwtInfo, storedSession, screenState, readFileSync, writeFileSync } from './v10lib.mjs'

const [label, scenario] = process.argv.slice(2)
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
// --- Realtime bridge with kill/block switches ---
const { WebSocket: NodeWS, ProxyAgent } = await import('undici')
const agent = new ProxyAgent(process.env.HTTPS_PROXY)
let wsBlocked = false
const sockets = new Set()
const frames = []
await ctx.routeWebSocket(/supabase\.co\/realtime\/v1\/websocket/, (ws) => {
  if (wsBlocked) {
    ws.close({ code: 4000, reason: 'blocked by test' })
    return
  }
  const up = new NodeWS(ws.url(), { dispatcher: agent })
  const q = []
  let open = false
  const pair = { ws, up }
  sockets.add(pair)
  up.onopen = () => {
    open = true
    for (const m of q.splice(0)) up.send(m)
  }
  up.onmessage = (e) => {
    const d = typeof e.data === 'string' ? e.data : Buffer.from(e.data)
    const s = String(d)
    if (/phx_reply|system|postgres_changes/.test(s) && !/heartbeat/.test(s)) frames.push([Number(rel()), s.slice(0, 140)])
    try {
      ws.send(d)
    } catch {}
  }
  up.onclose = (c) => {
    sockets.delete(pair)
    try {
      ws.close({ code: c.code === 1005 ? 1000 : c.code, reason: c.reason })
    } catch {}
  }
  up.onerror = () => {}
  ws.onMessage((m) => (open ? up.send(m) : q.push(m)))
  ws.onClose(() => {
    sockets.delete(pair)
    try {
      up.close()
    } catch {}
  })
})
// --- REST failure injection + marker replay ---
let mode = 'pass'
let marker = false
let captured = null
let n = 0
const stats = { aborted: 0, passed: 0, tourGets: 0, tourGetsOk: 0 }
const page = ctx.pages()[0] ?? (await ctx.newPage())
page.on('response', async (r) => {
  if (!captured && r.request().method() === 'GET' && r.url().includes(`${SB_HOST}/rest/v1/tournaments?`) && r.status() === 200) {
    try {
      captured = { status: r.status(), headers: r.headers(), body: await r.text() }
    } catch {}
  }
})
await ctx.route(`https://${SB_HOST}/rest/v1/**`, async (route) => {
  const req = route.request()
  const isTour = req.method() === 'GET' && req.url().includes('/rest/v1/tournaments?')
  if (isTour) stats.tourGets++
  if (mode !== 'pass') {
    n++
    const drop = mode === 'down' || (mode === 'alternate' && n % 2 === 1) || (mode === 'random10' && Math.random() < 0.1)
    if (drop) {
      stats.aborted++
      return route.abort('connectionreset')
    }
  }
  stats.passed++
  if (isTour && marker && captured) {
    stats.tourGetsOk++
    const row = JSON.parse(captured.body)
    row.name = `${row.name} ✱`
    const headers = { ...captured.headers }
    delete headers['content-encoding']
    delete headers['content-length']
    return route.fulfill({ status: captured.status, headers, body: JSON.stringify(row) })
  }
  return route.continue()
})
let tNav = Date.now()
const rel = () => ((Date.now() - tNav) / 1000).toFixed(2)
const out = []
const L = (...a) => {
  const line = `[t=${rel().padStart(6)}s] ${a.join(' ')}`
  out.push(line)
  console.log(line)
}
const snap = []
page.on('request', (r) => {
  const u = r.url()
  if (u.includes(`${SB_HOST}/rest/v1/`) && r.method() === 'GET') {
    const table = u.split('/rest/v1/')[1].split('?')[0]
    if (['tournaments', 'group_members', 'holes'].includes(table)) snap.push([Number(rel()), table])
  }
})
tNav = Date.now()
await page.goto(`${BASE}/t/ensayo`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('text=Individual', { timeout: 60000 })
for (let i = 0; i < 40 && !/En vivo/.test((await screenState(page)).hdr ?? ''); i++) await sleep(250)
const tBoard = Number(rel())
L(`run ${label} scenario=${scenario} user=${origUser}; board`, JSON.stringify(await screenState(page)), 'captured row:', !!captured)
const T = (s) => tBoard + s
let last = ''
let starAt = null
const vis = async (why) => {
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  L('>>> visibilitychange', why)
}
const watchUntil = async (tEnd, each) => {
  while (Number(rel()) < tEnd) {
    await each?.()
    const st = await screenState(page)
    const line = await page.locator('main').first().innerText().then((x) => (x.match(/Actualizado[^\n.]*/) ?? [''])[0]).catch(() => '')
    const sig = `hdr=${st.hdr} | ${line}`
    if (sig !== last) {
      L('screen', sig)
      last = sig
    }
    if (starAt == null && /✱/.test(st.hdr ?? '')) {
      starAt = Number(rel())
      L(`*** remote change visible (reload completed) at ${starAt}s`)
    }
    await sleep(250)
  }
}
await watchUntil(T(2))
marker = true
L('>>> marker on (the server "changed")')
if (scenario === 'burst' || scenario === 'burstws') {
  await watchUntil(T(3))
  mode = 'down'
  if (scenario === 'burstws') {
    wsBlocked = true
    for (const p of [...sockets]) {
      try {
        p.up.close()
      } catch {}
    }
    L('>>> REST down + socket dropped/blocked')
  } else L('>>> REST down (socket untouched)')
  await watchUntil(T(4))
  await vis('(reload attempt during the outage)')
  await watchUntil(T(16))
  mode = 'pass'
  wsBlocked = false
  L('>>> network fine again', JSON.stringify(stats))
  const before = snap.length
  await watchUntil(T(76))
  L('requests of snapshot tables between +16 s and +76 s:', JSON.stringify(snap.slice(before)))
  await vis('(a later app switch)')
  await watchUntil(T(86))
} else {
  mode = scenario
  L(`>>> REST ${scenario}`)
  let nextVis = T(5)
  await watchUntil(T(62), async () => {
    if (Number(rel()) >= nextVis) {
      nextVis += 5
      await vis('(every 5 s)')
    }
  })
  L('stats', JSON.stringify(stats))
  mode = 'pass'
  await watchUntil(T(72))
}
L('END starAt', starAt, 'stats', JSON.stringify(stats), 'snapshot-table GETs', snap.length)
L('realtime frames (join/system):', JSON.stringify(frames.slice(0, 6)))
await page.screenshot({ path: `${E}/shots/${label}-end.png` })
const after = await storedSession(page)
if (after?.access_token && jwtInfo(after.access_token).sub === origUser && after.refresh_token !== sess.refresh_token) {
  writeFileSync(`${E}/state/session.json`, JSON.stringify(after))
  L('session rotated; saved')
}
writeFileSync(`${E}/logs/${label}.log`, out.join('\n') + '\n')
writeFileSync(`${E}/logs/${label}.snap.json`, JSON.stringify(snap))
await ctx.close()
