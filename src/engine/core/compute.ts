/**
 * The core: handicaps, strokes received and per-hole scoring for every
 * player in every round. Modules build on this.
 */
import type { TournamentSettings } from '../settings/schema'
import type { Explanation, Hole, Id, Player, Round, Snapshot, Tee } from '../types'
import { roundHalfUp } from './rounding'
import { courseHandicap, estimateIndex, nextRoundCut, playingHandicap, strokesReceived } from './handicap'
import { netScoreName, stablefordPoints } from './stableford'
import { withTrueMinus } from '../formats/format'
import { handicapText } from '../../i18n/es-MX'
import type { CoreState, HoleResult, PlayerRound } from './types'

/** Default 18 holes when no course is loaded: par 4, SI 1..18. Flagged as a warning. */
/**
 * The nine holes of a 9-hole round ranked 1–9 by their 18-hole stroke index
 * (the hardest is 1), ties by hole number: how WHS allocates a 9-hole playing
 * handicap. Exported for tests.
 */
export function nineHoleRanks(holes: Hole[]): Map<number, number> {
  const ranked = [...holes].sort((a, b) => a.strokeIndex - b.strokeIndex || a.number - b.number)
  return new Map(ranked.map((h, i) => [h.number, i + 1]))
}

function placeholderHoles(n: number): Hole[] {
  return Array.from({ length: n }, (_, i) => ({ number: i + 1, par: 4, strokeIndex: i + 1, yards: null }))
}

export function activeRounds(snapshot: Snapshot): Round[] {
  return [...snapshot.rounds].filter((r) => r.status !== 'cancelled').sort((a, b) => a.number - b.number)
}

/** Every loaded tee by id, whatever its course: what `teeForPlayerRound` looks a chosen tee up in. */
export function teeById(snapshot: Snapshot): Map<Id, Tee> {
  const m = new Map<Id, Tee>()
  for (const c of snapshot.courses) for (const t of c.tees) m.set(t.id, t)
  return m
}

/** Which tee a player plays in a round: round_tees → default tee (if on this course) → first tee of the course. */
export function teeForPlayerRound(snapshot: Snapshot, round: Round, player: Player, tees: Map<Id, Tee>): Tee | null {
  const rt = snapshot.roundTees.find((x) => x.roundId === round.id && x.playerId === player.id)
  if (rt) return tees.get(rt.teeId) ?? null
  const def = player.defaultTeeId ? tees.get(player.defaultTeeId) : undefined
  if (def && (!round.courseId || def.courseId === round.courseId)) return def
  const course = snapshot.courses.find((c) => c.id === round.courseId)
  return course?.tees[0] ?? null
}

function teePar(tee: Tee | null, holes: number): number {
  if (!tee) return 4 * holes
  return tee.holes.slice(0, holes).reduce((s, h) => s + h.par, 0)
}

function baseHandicap(player: Player, settings: TournamentSettings): CoreState['handicaps'][string] {
  if (player.handicapSource === 'estimate' && player.estimateInputs) {
    const est = estimateIndex(player.estimateInputs, settings.handicap)
    return { source: 'estimate', base: est.value, estimated: true, why: est.why }
  }
  if (player.handicapSource === 'index') {
    const idx = player.handicapIndex ?? player.baseHcp
    return {
      source: 'index',
      base: idx,
      estimated: false,
      why: { title: `Índice ${handicapText(idx)}`, steps: ['Índice de hándicap capturado por el Comité'] },
    }
  }
  return {
    source: 'manual',
    base: player.baseHcp,
    estimated: false,
    why: { title: `Hándicap base ${handicapText(player.baseHcp)}`, steps: ['Capturado por el Comité; se usa tal cual'] },
  }
}

export function computeCore(snapshot: Snapshot, settings: TournamentSettings): CoreState {
  const warnings: string[] = []
  const tees = teeById(snapshot)
  const rounds = activeRounds(snapshot)
  const players = [...snapshot.players].sort((a, b) => a.sortOrder - b.sortOrder)
  const handicaps: CoreState['handicaps'] = {}
  for (const p of players) handicaps[p.id] = baseHandicap(p, settings)

  const state: CoreState = { roundIds: rounds.map((r) => r.id), rounds: {}, totals: {}, handicaps, warnings }
  const scoresIdx = new Map<string, (typeof snapshot.scores)[number]>()
  for (const s of snapshot.scores) scoresIdx.set(`${s.roundId}|${s.playerId}|${s.hole}`, s)

  // Cumulative cut per player as rounds go by.
  const cutsSoFar: Record<Id, { total: number; steps: string[] }> = {}
  const prevPoints: Record<Id, number | null> = {}
  for (const p of players) {
    cutsSoFar[p.id] = { total: 0, steps: [] }
    prevPoints[p.id] = null
  }

  for (const [ri, round] of rounds.entries()) {
    const byPlayer: Record<Id, PlayerRound> = {}
    let warnedNoCourse = false
    for (const p of players) {
      const hc = handicaps[p.id]!
      const tee = teeForPlayerRound(snapshot, round, p, tees)
      if (!tee && !warnedNoCourse) {
        warnings.push(`Día ${round.number}: sin campo cargado; se usa par 4 en todos los hoyos.`)
        warnedNoCourse = true
      }
      const holes: Hole[] = tee ? tee.holes.slice(0, round.holes) : placeholderHoles(round.holes)

      // Base → course handicap.
      let courseHcp = hc.base
      const steps: string[] = [hc.why.title]
      // A plus handicap typed by the Comité: the arithmetic below uses it below zero.
      if (hc.source === 'manual' && hc.base < 0) steps.push(`En la cuenta, ${withTrueMinus(hc.base)}`)
      if (hc.source !== 'manual') {
        const useTee = settings.handicap.perRoundSlope
          ? tee
          : (p.defaultTeeId ? tees.get(p.defaultTeeId) : undefined) ?? tee
        if (useTee) {
          const ch = courseHandicap(hc.base, { slope: useTee.slope, rating: useTee.rating, par: teePar(useTee, 18) })
          courseHcp = ch.value
          steps.push(...ch.why.steps)
        }
      }

      // Course handicap → playing handicap → cut → override.
      const ph = playingHandicap(courseHcp, settings.handicap)
      steps.push(...ph.why.steps)
      const cuts = cutsSoFar[p.id]!
      if (ri > 0) {
        const prev = prevPoints[p.id]
        const cut = prev == null ? { value: 0, why: { title: '', steps: ['Sin ronda anterior: sin recorte'] } } : nextRoundCut(prev, settings.day2Cut)
        // Rounds 3+: `previous` recomputes from the last round alone; `cumulative` adds the cuts up (§5.2 only defines Day 2).
        if (settings.day2Cut.mode === 'cumulative') {
          cuts.total += cut.value
          cuts.steps.push(`Día ${round.number - 1}: ${cut.why.steps.join('; ')}`)
        } else {
          cuts.total = cut.value
          cuts.steps = [`Día ${round.number - 1}: ${cut.why.steps.join('; ')}`]
        }
      }
      let playingHcp = Math.max(0, ph.value - cuts.total)
      // A cut larger than the handicap stops at 0: «2 − 4 = −2, no baja de 0», never «2 − 4 = 0».
      const afterCut = ph.value - cuts.total
      if (cuts.total > 0) steps.push(...cuts.steps, `${ph.value} − ${cuts.total} = ${afterCut < 0 ? `${withTrueMinus(afterCut)}, no baja de 0: 0` : playingHcp}`)
      else if (ri > 0) steps.push(...cuts.steps)
      let overridden = false
      const ov = snapshot.handicapOverrides.find((o) => o.roundId === round.id && o.playerId === p.id)
      if (ov) {
        overridden = true
        steps.push(`Ajuste del Comité: de ${playingHcp} a ${ov.playingHcp} (${ov.reason})`)
        playingHcp = ov.playingHcp
      }
      if (round.holes === 9) steps.push(`Ronda de 9 hoyos: la mitad, ${roundHalfUp(playingHcp / 2)}, repartida en los nueve hoyos del más difícil al más fácil`)
      const playingHcpWhy: Explanation = { title: `Hándicap de juego ${playingHcp}`, steps }

      // Holes.
      const results: HoleResult[] = []
      let points = 0
      let putts = 0
      let thru = 0
      let gross: number | null = 0
      // A 9-hole round plays half the playing handicap (half up) over these
      // nine holes: they are ranked 1–9 by their 18-hole stroke index and the
      // strokes go round them, the WHS 9-hole allocation (MONEY-03). Before,
      // the half was allocated against 1–18 and about half of it was lost.
      const nineRank = round.holes === 9 ? nineHoleRanks(holes) : null
      for (const h of holes) {
        const s = scoresIdx.get(`${round.id}|${p.id}|${h.number}`)
        const sr = nineRank ? strokesReceived(roundHalfUp(playingHcp / 2), nineRank.get(h.number)!, 9) : strokesReceived(playingHcp, h.strokeIndex, round.holes)
        const played = !!s && (s.strokes != null || s.pickedUp)
        const g = played && !s.pickedUp ? s.strokes : null
        const pts = played ? stablefordPoints(h.par, sr, g, s.pickedUp) : 0
        const net = g != null ? g - sr : null
        const why: Explanation = {
          title: `${pts} pts`,
          steps: played
            ? s.pickedUp
              ? ['Levantó: 0 pts']
              : [
                  `Par ${h.par}, SI ${h.strokeIndex}: ${sr} golpe${sr === 1 ? '' : 's'} de ventaja`,
                  `${g} − ${sr} = ${withTrueMinus(net ?? 0)} neto`,
                  // Below zero counts as 0: «4 + 0 − 9 + 2 = −3, cuenta 0 pts», never «= 0».
                  h.par + sr - (g ?? 0) + 2 < 0
                    ? `${h.par} + ${sr} − ${g} + 2 = ${withTrueMinus(h.par + sr - (g ?? 0) + 2)}, cuenta 0 pts (${netScoreName(0)})`
                    : `${h.par} + ${sr} − ${g} + 2 = ${pts} pts (${netScoreName(pts)})`,
                ]
            : ['Sin capturar'],
        }
        results.push({
          hole: h.number,
          par: h.par,
          strokeIndex: h.strokeIndex,
          yards: h.yards,
          strokesReceived: sr,
          gross: g,
          net,
          points: pts,
          putts: s?.putts ?? null,
          pickedUp: !!s?.pickedUp,
          played,
          disputed: !!s?.disputed,
          why,
        })
        if (played) {
          thru++
          points += pts
          putts += s.putts ?? 0
          if (g == null) gross = null
          else if (gross != null) gross += g
        } else gross = null
      }
      byPlayer[p.id] = {
        roundId: round.id,
        roundNumber: round.number,
        playerId: p.id,
        tee,
        courseHcp,
        playingHcp,
        playingHcpWhy,
        cut: cuts.total,
        overridden,
        holes: results,
        points,
        putts,
        thru,
        complete: thru === round.holes,
        gross: thru === round.holes ? gross : null,
      }
      // Only a round with scores feeds the next round's cut.
      prevPoints[p.id] = thru > 0 ? points : null
    }
    state.rounds[round.id] = byPlayer
  }

  for (const p of players) {
    const t = { points: 0, putts: 0, thru: 0, roundsPlayed: 0 }
    for (const rid of state.roundIds) {
      const pr = state.rounds[rid]?.[p.id]
      if (!pr) continue
      t.points += pr.points
      t.putts += pr.putts
      t.thru += pr.thru
      if (pr.thru > 0) t.roundsPlayed++
    }
    state.totals[p.id] = t
  }
  return state
}
