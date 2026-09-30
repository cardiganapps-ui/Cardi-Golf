import { describe, it } from 'vitest'
import { getFixture, FIXTURE_NAMES } from '/home/user/Cardi-Golf/src/dev/fixtures'
import { dataFromSnapshot } from '/home/user/Cardi-Golf/src/data/tournamentStore'
import os from 'node:os'

describe('compute cost per change (the store runs this on every realtime event and every optimistic patch)', () => {
  it('times dataFromSnapshot', () => {
    const rows: string[] = []
    for (const name of ['full12-live', 'full12-finished', 'large60', 'pairs8', 'minimal4-live']) {
      if (!FIXTURE_NAMES.includes(name)) continue
      const f = getFixture(name)!
      const snap = f.snapshot
      for (let i = 0; i < 3; i++) dataFromSnapshot(structuredClone(snap)) // warm up
      const times: number[] = []
      for (let i = 0; i < 15; i++) {
        const s = structuredClone(snap)
        const t0 = performance.now()
        dataFromSnapshot(s)
        times.push(performance.now() - t0)
      }
      times.sort((a, b) => a - b)
      rows.push(`${name.padEnd(16)} players=${String(snap.players.length).padStart(3)} scores=${String(snap.scores.length).padStart(5)} median=${times[7]!.toFixed(1)}ms min=${times[0]!.toFixed(1)}ms max=${times[14]!.toFixed(1)}ms`)
    }
    console.log(`load=${os.loadavg().map((x) => x.toFixed(2)).join(',')} cpus=${os.cpus().length}\n` + rows.join('\n'))
  })
})
