/** V11 / REL-11: engine recompute cost per snapshot (what phone B pays after each refetch, phone A per enqueue). */
import { it } from 'vitest'
import { execSync } from 'node:child_process'
const { getFixture } = await import('/home/user/Cardi-Golf/src/dev/fixtures')
const { dataFromSnapshot } = await import('/home/user/Cardi-Golf/src/data/tournamentStore')
it('computeTournament timing on full12-live and large60', () => {
  const out: Record<string, unknown> = { load: execSync('cat /proc/loadavg').toString().trim() }
  for (const name of ['full12-live', 'large60']) {
    const snap = getFixture(name)!.snapshot
    for (let i = 0; i < 10; i++) dataFromSnapshot(structuredClone(snap)) // warm-up (JIT)
    const compute: number[] = []
    const patch: number[] = []
    for (let i = 0; i < 40; i++) {
      const c = structuredClone(snap)
      const t0 = performance.now()
      dataFromSnapshot(c)
      compute.push(performance.now() - t0)
      const t1 = performance.now()
      dataFromSnapshot(structuredClone(snap)) // the outbox's patch(): clone + compute
      patch.push(performance.now() - t1)
    }
    const med = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)]!
    out[name] = { scores: snap.scores.length, players: snap.players.length, compute_ms_median: +med(compute).toFixed(2), clone_plus_compute_ms_median: +med(patch).toFixed(2) }
  }
  out.loadAfter = execSync('cat /proc/loadavg').toString().trim()
  console.log(JSON.stringify(out))
})
