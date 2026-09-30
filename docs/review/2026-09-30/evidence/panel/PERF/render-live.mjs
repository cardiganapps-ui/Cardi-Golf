// Re-render counts and main-thread cost of one store update on the En vivo board (fixture routes, instrumented build).
// usage: node render-live.mjs <fixture> [cpuRate=1] [base=http://127.0.0.1:4186] [screen=''] [idle=1]
import { writeFileSync } from 'node:fs'
import { launch, newPhone, sleep, load, cdpMetrics, diffMetrics, topN, E } from './perf-lib.mjs'

const fixture = process.argv[2] ?? 'large60'
const rate = Number(process.argv[3] ?? 1)
const BASE = process.argv[4] ?? 'http://127.0.0.1:4186'
const screen = process.argv[5] ?? ''
const doIdle = (process.argv[6] ?? '1') === '1'
const b = await launch()
const ctx = await newPhone(b)
await ctx.route(/supabase\.co/, (r) => r.abort())
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)))
const cdp = await ctx.newCDPSession(page)
await cdp.send('Performance.enable')
await page.goto(`${BASE}/t/_/${fixture}${screen}`, { waitUntil: 'load' })
await page.waitForFunction(() => window.__perfStore?.getState().data, null, { timeout: 30000 })
await sleep(2500)
if (rate > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate })
const out = { fixture, screen, cpuRate: rate, loadBefore: load(), scenarios: {} }

async function scenario(name, fn, waitMs = 1500) {
  await page.evaluate(() => window.__RCreset())
  const m0 = await cdpMetrics(cdp)
  const inPage = await page.evaluate(fn)
  await sleep(waitMs)
  const m1 = await cdpMetrics(cdp)
  const rc = await page.evaluate(() => JSON.parse(JSON.stringify(window.__RC)))
  const lastCommit = rc.commitTimes.length ? rc.commitTimes[rc.commitTimes.length - 1] : null
  out.scenarios[name] = {
    inPage,
    commits: rc.commits,
    componentsRendered: rc.nRendered,
    componentsMounted: rc.nMounted,
    domMutationRecords: rc.mutations,
    domNodesAddedRemoved: rc.mutationNodes,
    firstCommitAfterStartMs: rc.commitTimes.length && inPage?.t0 != null ? +(rc.commitTimes[0] - inPage.t0).toFixed(1) : null,
    lastCommitAfterStartMs: lastCommit && inPage?.t0 != null ? +(lastCommit - inPage.t0).toFixed(1) : null,
    topRendered: topN(rc.rendered, 14),
    cdp: diffMetrics(m0, m1),
  }
  console.log(name, JSON.stringify({ commits: rc.commits, rendered: rc.nRendered, mounted: rc.nMounted, dom: rc.mutations, cdp: out.scenarios[name].cdp, inPage }))
}

// 1) A reload that brings no change: new data object from an identical snapshot (what Realtime/visibility reloads do).
await scenario('noopReload', () => {
  const st = window.__perfStore.getState()
  const snap = structuredClone(st.data.snapshot)
  const t0 = performance.now()
  const data = window.__perfData(snap)
  const tCompute = performance.now() - t0
  window.__perfStore.setState({ data, updatedAt: Date.now(), error: null })
  return { t0, computeMs: +tCompute.toFixed(1) }
})
// 2) One score changes in the live round (a stroke better for a mid-table player): recompute, re-sort.
await scenario('oneScore', () => {
  const st = window.__perfStore.getState()
  const snap = structuredClone(st.data.snapshot)
  const rid = snap.tournament.currentRoundId ?? snap.rounds[snap.rounds.length - 1].id
  const rows = st.data.state.modules.individual?.rows ?? []
  const mid = rows[Math.floor(rows.length / 2)]?.playerId
  const sc = snap.scores.filter((s) => s.roundId === rid && s.playerId === mid && !s.pickedUp && (s.strokes ?? 0) > 2).pop()
  if (sc) {
    sc.strokes -= 2
    sc.updatedAt = new Date().toISOString()
  }
  const t0 = performance.now()
  const data = window.__perfData(snap)
  const tCompute = performance.now() - t0
  window.__perfStore.setState({ data, updatedAt: Date.now(), error: null })
  return { t0, computeMs: +tCompute.toFixed(1), changed: !!sc, player: mid }
})
// 3) Nothing happens for 31 s.
if (doIdle) await scenario('idle31s', () => ({ t0: performance.now() }), 31000)
out.loadAfter = load()
out.errors = errors
const f = `${E}/render-live-${fixture}${screen.replace(/\//g, '_')}-cpu${rate}-${Date.now()}.json`
writeFileSync(f, JSON.stringify(out, null, 2))
console.log('saved', f, 'load', out.loadBefore, '→', out.loadAfter, 'errors', errors.length)
await b.close()
