import { it } from 'vitest'
import { computeCore } from '/home/user/Cardi-Golf/src/engine/core/compute'
import { DEFAULT_SETTINGS } from '/home/user/Cardi-Golf/src/engine/settings/presets'
import { makeCourse, makePlayer, makeRound, makeSnapshot } from '/home/user/Cardi-Golf/src/engine/testing/fixtures'
it('strokes received over a 9-hole round', () => {
  for (const hcp of [10, 20, 30]) {
    const snap = makeSnapshot({ players: [makePlayer(1, { baseHcp: hcp })], rounds: [makeRound(1, { holes: 9 })], courses: [makeCourse()] } as never)
    const core = computeCore(snap, DEFAULT_SETTINGS)
    const pr = core.rounds['r1']!['p1']!
    const strokes = pr.holes.reduce((s, h) => s + h.strokesReceived, 0)
    console.log(`manual hcp ${hcp} (100% allowance): PH18=${pr.playingHcp}, 9-hole round on holes ${pr.holes.map((h) => h.hole).join(',')} (SI ${pr.holes.map((h) => h.strokeIndex).join(',')}) → strokes received total ${strokes}; half of PH18 = ${Math.round(pr.playingHcp / 2)}`)
  }
})
