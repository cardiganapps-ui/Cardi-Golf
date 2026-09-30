import { test } from 'vitest'
import { writeFileSync } from 'node:fs'
import { loadavg, cpus } from 'node:os'
import { Session } from 'node:inspector/promises'
import { getFixture } from '/home/user/Cardi-Golf/src/dev/fixtures'
import { computeTournament } from '/home/user/Cardi-Golf/src/engine/computeTournament'
import { parseSettings } from '/home/user/Cardi-Golf/src/engine/settings/schema'

const E = '/tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad/panel/evidence/PERF'
const RUNS = Number(process.env.RUNS ?? 60)
const q = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))]! }
const fmt = (xs: number[]) => ({ median: +q(xs, 0.5).toFixed(2), p95: +q(xs, 0.95).toFixed(2), min: +Math.min(...xs).toFixed(2), max: +Math.max(...xs).toFixed(2) })

function timeIt(fn: () => unknown, runs = RUNS) {
  for (let i = 0; i < 8; i++) fn()
  const xs: number[] = []
  for (let i = 0; i < runs; i++) { const t0 = performance.now(); fn(); xs.push(performance.now() - t0) }
  return fmt(xs)
}

test('engine timings', async () => {
  const out: Record<string, unknown> = { at: new Date().toISOString(), loadBefore: loadavg().map((x) => +x.toFixed(2)), cpu: cpus()[0]?.model, cores: cpus().length, runs: RUNS, node: process.version }
  const names = ['large60', 'full12-live', 'full12-finished', 'friends8', 'pairs8', 'minimal4-live']
  for (const name of names) {
    const f = getFixture(name)
    if (!f) { out[name] = 'missing'; continue }
    const snap = f.snapshot
    const settings = parseSettings(snap.tournament.settings)
    const state = computeTournament(snap, settings)
    const row: Record<string, unknown> = {
      players: snap.players.length, rounds: snap.rounds.length, scores: snap.scores.length,
      snapshotJsonKB: +(JSON.stringify(snap).length / 1024).toFixed(1),
      stateJsonKB: +(JSON.stringify(state).length / 1024).toFixed(1),
    }
    row.parseSettings = timeIt(() => parseSettings(snap.tournament.settings))
    row.computeTournament = timeIt(() => computeTournament(snap, settings))
    row.structuredClone = timeIt(() => structuredClone(snap))
    // The store's compute(): spread + overlay (no-op) + parseSettings + computeTournament; patch() adds a structuredClone.
    row.storeCompute = timeIt(() => { const s = { ...snap }; computeTournament(s, parseSettings(s.tournament.settings)) })
    row.storePatch = timeIt(() => { const s = structuredClone(snap); computeTournament(s, parseSettings(s.tournament.settings)) })
    out[name] = row
  }
  // CPU profile of 40 computeTournament runs on large60 for hotspots.
  const f = getFixture('large60')!
  const settings = parseSettings(f.snapshot.tournament.settings)
  const session = new Session()
  session.connect()
  await session.post('Profiler.enable')
  await session.post('Profiler.setSamplingInterval', { interval: 100 })
  await session.post('Profiler.start')
  for (let i = 0; i < 40; i++) computeTournament(f.snapshot, settings)
  const { profile } = await session.post('Profiler.stop')
  writeFileSync(`${E}/bench/large60-compute.cpuprofile`, JSON.stringify(profile))
  // Self time by function (top 25).
  const byId = new Map(profile.nodes.map((n: any) => [n.id, n]))
  const self = new Map<string, number>()
  const dt = profile.timeDeltas as number[]
  const samples = profile.samples as number[]
  for (let i = 0; i < samples.length; i++) {
    const n: any = byId.get(samples[i])
    const cf = n.callFrame
    const key = `${cf.functionName || '(anon)'} ${String(cf.url).replace(/^.*\/src\//, 'src/').replace(/^.*node_modules\//, 'nm/')}:${cf.lineNumber + 1}`
    self.set(key, (self.get(key) ?? 0) + (dt[i] ?? 0) / 1000)
  }
  const total = [...self.values()].reduce((a, b) => a + b, 0)
  out.large60ProfileTop = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => `${v.toFixed(1)}ms ${((v / total) * 100).toFixed(1)}% ${k}`)
  out.loadAfter = loadavg().map((x) => +x.toFixed(2))
  const file = `${E}/bench/engine-${Date.now()}.json`
  writeFileSync(file, JSON.stringify(out, null, 2))
  console.log(JSON.stringify(out, null, 2))
})
