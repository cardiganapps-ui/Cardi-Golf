/**
 * MONEY-18: a hole saved with strokes and no putts (a restore of an older
 * export, a fix by hand, an older build's direct write) counted as 0 putts
 * for Menos putts and could never pass the snake. The review's case: J2's
 * first ten holes without putts gave him 52 putts over 36 holes and the
 * $1,000. Now the hole counts for nothing in Menos putts, the Comité is told
 * which holes to fill, and the tournament does not close until they are.
 */
import { describe, expect, it } from 'vitest'
import { closeCheck } from '../close'
import { computeTournament } from '../computeTournament'
import { GAME_ENTRIES } from '../games/catalog'
import { DEFAULT_SETTINGS, FIRST_TOURNAMENT_SETTINGS as S } from '../settings/presets'
import type { TournamentSettings } from '../settings/schema'
import { makeFirstTournament, score } from '../testing/fixtures'
import type { Snapshot } from '../types'
import { t } from '../../i18n/es-MX'
import { puttingGames, puttsMissing } from './putts'
import { words } from '../testing/words'

/** Both days finished: a bogey and 2 putts on every hole, J5 one-putting the 1st of each day (70 putts, the fewest). */
function played(edit?: (snap: Snapshot) => void, settings: TournamentSettings = S) {
  const snap = makeFirstTournament()
  const holes = snap.courses[0]!.tees[0]!.holes
  for (const rid of ['r1', 'r2'])
    for (const p of snap.players)
      for (const h of holes)
        snap.scores.push(score(rid, p.id, h.number, h.par + 1, p.id === 'p5' && h.number === 1 ? 1 : 2))
  snap.rounds.forEach((r) => (r.status = 'finished'))
  edit?.(snap)
  return { snap, st: computeTournament(snap, settings) }
}
/** J2's holes 1–10 on day 1 saved with strokes and no putts. */
const noPutts = (snap: Snapshot) => {
  for (const s of snap.scores) if (s.roundId === 'r1' && s.playerId === 'p2' && s.hole <= 10) s.putts = null
}
const TEN = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
const close = (snap: Snapshot, settings: TournamentSettings = S) => closeCheck(snap, settings, { openRejected: 0 })

describe('a hole played without putts (MONEY-18)', () => {
  it('never counts as 0 putts: J2 does not take Menos putts on ten holes he never putted', () => {
    const { st } = played(noPutts)
    const fp = st.modules.fewestPutts!
    expect(Object.entries(fp.prizes).map(([id, p]) => [id, p.amount])).toEqual([['p5', 1000]])
    const j2 = fp.rows.find((r) => r.playerId === 'p2')!
    // 26 holes with putts, 52 putts: behind everyone who has 36, so he can't win until they are captured.
    expect([j2.holes, j2.putts, j2.missingPutts, j2.complete]).toEqual([26, 52, 10, false])
    expect(fp.rows[0]!.playerId).toBe('p5')
  })

  it('the Comité is told which holes, and which games wait for them', () => {
    const { st } = played(noPutts)
    expect(st.flags.missingPutts).toEqual([{ roundId: 'r1', roundNumber: 1, playerId: 'p2', holes: TEN }])
    expect(puttingGames(S)).toEqual(['La Víbora', 'Menos putts'])
    expect(words(st.flags.warnings)).toContain(
      'Faltan putts: J2 (día 1: hoyos 1, 2, 3, 4, 5, 6, 7, 8, 9 y 10). Hasta que el Comité los capture en Tarjetas, La Víbora y Menos putts no los cuentan.',
    )
  })

  it('the tournament does not close on a guess, and closes once the putts are captured', () => {
    const { snap } = played(noPutts)
    expect(close(snap).blockers.map((b) => ({ kind: b.kind, text: words(b.says) }))).toContainEqual({
      kind: 'missingPutts',
      text: 'Faltan los putts de 10 hoyos: captúralos en Comité, sección Tarjetas.',
    })
    for (const s of snap.scores) s.putts ??= 2
    const st = computeTournament(snap, S)
    expect(st.flags.missingPutts).toEqual([])
    expect(words(st.flags.warnings).filter((w) => w.startsWith('Faltan putts'))).toEqual([])
    expect(st.modules.fewestPutts!.rows.find((r) => r.playerId === 'p2')!.holes).toBe(36)
    expect(close(snap).blockers.map((b) => b.kind)).not.toContain('missingPutts')
  })

  it('a pick-up without putts is not missing anything: it counts the setting’s putts (§18.1)', () => {
    const { st } = played((snap) => {
      const s = snap.scores.find((x) => x.roundId === 'r1' && x.playerId === 'p3' && x.hole === 5)!
      Object.assign(s, { strokes: null, putts: null, pickedUp: true })
    })
    expect(st.flags.missingPutts).toEqual([])
    const j3 = st.modules.fewestPutts!.rows.find((r) => r.playerId === 'p3')!
    expect([j3.holes, j3.putts, j3.pickedUpHoles, j3.missingPutts]).toEqual([36, 73, 1, 0])
    expect(puttsMissing({ played: true, pickedUp: true, putts: null })).toBe(false)
    expect(puttsMissing({ played: false, pickedUp: false, putts: null })).toBe(false)
    expect(puttsMissing({ played: true, pickedUp: false, putts: null })).toBe(true)
  })

  it('with no game paying on putts, a hole without them holds nothing', () => {
    const settings: TournamentSettings = { ...DEFAULT_SETTINGS, rounds: 2 }
    const { snap, st } = played(noPutts, settings)
    expect(puttingGames(settings)).toEqual([])
    expect(st.flags.missingPutts).toEqual([])
    expect(close(snap, settings).blockers.map((b) => b.kind)).not.toContain('missingPutts')
  })

  it('a fine per three-putt pays on putts too: its holes are named and the close waits', () => {
    const fine = GAME_ENTRIES.find((e) => e.key === 'threePutts')!.create('tres-putts')
    const settings: TournamentSettings = { ...DEFAULT_SETTINGS, rounds: 2, games: [fine] }
    const { snap, st } = played(noPutts, settings)
    expect(puttingGames(settings)).toEqual(['Tres putts'])
    expect(st.flags.missingPutts.map((m) => m.holes)).toEqual([TEN])
    expect(words(st.flags.warnings)).toContain(
      t.missingPutts.warning(['J2 (día 1: hoyos 1, 2, 3, 4, 5, 6, 7, 8, 9 y 10)'], ['Tres putts']),
    )
    expect(close(snap, settings).blockers.map((b) => b.kind)).toContain('missingPutts')
  })

  it('a player missing putts on both days is one line, day by day', () => {
    const { st } = played((snap) => {
      noPutts(snap)
      snap.scores.find((x) => x.roundId === 'r2' && x.playerId === 'p2' && x.hole === 18)!.putts = null
    })
    expect(words(st.flags.warnings)).toContain(
      'Faltan putts: J2 (día 1: hoyos 1, 2, 3, 4, 5, 6, 7, 8, 9 y 10; día 2: hoyo 18). Hasta que el Comité los capture en Tarjetas, La Víbora y Menos putts no los cuentan.',
    )
  })
})
