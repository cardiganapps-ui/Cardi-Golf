// Accelerated leak test: 600 store updates (a changed score each) at ~5/s on the fixture board; heap after GC at 0/300/600
// updates, and a per-constructor count diff between heap snapshots at 300 and 600 (what grows per update, if anything).
// usage: node leak-accel.mjs [fixture=large60] [updates=600]
import { writeFileSync } from 'node:fs'
import { launch, newPhone, sleep, load, cdpMetrics, E } from './perf-lib.mjs'

const fixture = process.argv[2] ?? 'large60'
const N = Number(process.argv[3] ?? 600)
const b = await launch()
const ctx = await newPhone(b)
await ctx.route(/supabase\.co/, (r) => r.abort())
const page = await ctx.newPage()
const cdp = await ctx.newCDPSession(page)
await cdp.send('Performance.enable')
await cdp.send('HeapProfiler.enable')
await page.goto(`http://127.0.0.1:4186/t/_/${fixture}`, { waitUntil: 'load' })
await page.waitForFunction(() => window.__perfStore?.getState().data, null, { timeout: 30000 })
await sleep(2000)

async function snapshotCounts() {
  const chunks = []
  const onChunk = (e) => chunks.push(e.chunk)
  cdp.on('HeapProfiler.addHeapSnapshotChunk', onChunk)
  await cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false, captureNumericValue: false })
  cdp.off('HeapProfiler.addHeapSnapshotChunk', onChunk)
  const snap = JSON.parse(chunks.join(''))
  const m = snap.snapshot.meta
  const F = m.node_fields.length
  const iType = m.node_fields.indexOf('type'), iName = m.node_fields.indexOf('name'), iSize = m.node_fields.indexOf('self_size')
  const types = m.node_types[0]
  const counts = new Map()
  for (let i = 0; i < snap.nodes.length; i += F) {
    const t = types[snap.nodes[i + iType]]
    const key = t === 'object' || t === 'closure' || t === 'array' ? `${t}:${snap.strings[snap.nodes[i + iName]]}` : t
    const c = counts.get(key) ?? [0, 0]
    c[0]++
    c[1] += snap.nodes[i + iSize]
    counts.set(key, c)
  }
  return counts
}
async function heap() {
  await cdp.send('HeapProfiler.collectGarbage')
  await sleep(200)
  const m = await cdpMetrics(cdp)
  return { heapMB: +(m.JSHeapUsedSize / 1048576).toFixed(2), nodes: m.Nodes, listeners: m.JSEventListeners }
}
const update = (k) =>
  page.evaluate((k) => {
    const st = window.__perfStore.getState()
    const snap = structuredClone(st.data.snapshot)
    const rid = snap.tournament.currentRoundId ?? snap.rounds[snap.rounds.length - 1].id
    const live = snap.scores.filter((s) => s.roundId === rid && !s.pickedUp && s.strokes != null)
    const sc = live[(k * 7) % live.length]
    if (sc) { sc.strokes = sc.strokes > 3 ? sc.strokes - 1 : sc.strokes + 1; sc.updatedAt = new Date(Date.now() + k).toISOString() }
    window.__perfStore.setState({ data: window.__perfData(snap), updatedAt: Date.now(), error: null })
  }, k)

const out = { fixture, updates: N, load: load(), samples: [] }
out.samples.push({ at: 0, ...(await heap()) })
for (let k = 1; k <= N; k++) {
  await update(k)
  await sleep(150)
  if (k === Math.floor(N / 2)) {
    out.samples.push({ at: k, ...(await heap()) })
    out.countsHalf = await snapshotCounts()
  }
}
await sleep(1000)
out.samples.push({ at: N, ...(await heap()) })
const countsEnd = await snapshotCounts()
const diff = []
for (const [k, [n, s]] of countsEnd) {
  const [n0, s0] = out.countsHalf.get(k) ?? [0, 0]
  if (n - n0 !== 0 || s - s0 > 1024) diff.push([k, n - n0, s - s0])
}
diff.sort((a, b) => b[2] - a[2])
out.topGrowthHalfToEnd = diff.slice(0, 15).map(([k, dn, ds]) => `${k}: ${dn >= 0 ? '+' : ''}${dn} objects, ${ds >= 0 ? '+' : ''}${(ds / 1024).toFixed(1)} KB`)
delete out.countsHalf
out.loadEnd = load()
writeFileSync(`${E}/leak-accel-${fixture}-${Date.now()}.json`, JSON.stringify(out, null, 2))
console.log(JSON.stringify(out, null, 1))
await b.close()
