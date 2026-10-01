/**
 * UX-06: «Para empezar» lists what a tournament still needs before its next
 * tee. The wizard asked «¿Cuántos días?» and created no rounds, and nothing
 * told a new organizer what was missing. The second half pins what the
 * verifier found the first list got wrong: lines that nag about nothing,
 * send you where you can't fix them, or say «Listo» too early.
 */
import { describe, expect, it } from 'vitest'
import { getFixture } from '../../dev/fixtures'
import { dataFromSnapshot } from '../../data/tournamentStore'
import { nextRoundGroups } from '../../engine/formats/bracket'
import { makeTee } from '../../engine/testing/fixtures'
import type { Snapshot } from '../../engine/types'
import { coveredByChecklist, readiness, setupBadge, type Entry, type ReadinessItem } from './readiness'

type Items = Partial<Record<ReadinessItem['id'], ReadinessItem>>

function run(name: string, edit?: (s: Snapshot) => void, entry?: (s: Snapshot) => Partial<Entry>) {
  const snapshot = structuredClone(getFixture(name)!.snapshot)
  edit?.(snapshot)
  const d = dataFromSnapshot(snapshot)
  const e: Entry = { pins: new Set(d.snapshot.players.map((p) => p.id)), bracket: d.state.bracket, ...entry?.(d.snapshot) }
  const items = readiness(d.snapshot, d.settings, e)
  return { d, items, by: Object.fromEntries(items.map((i) => [i.id, i])) as Items }
}
const check = (name: string, edit?: (s: Snapshot) => void, entry?: (s: Snapshot) => Partial<Entry>) => run(name, edit, entry).by

describe('Para empezar', () => {
  it('a tournament seconds after «Crear torneo»: players and the rounds\' course and date are missing', () => {
    const r = check('new-setup')
    expect(r.players).toMatchObject({ done: false, text: 'Da de alta a los jugadores (al menos 2)', to: 'jugadores' })
    expect(r.rounds).toMatchObject({ done: true, text: '2 rondas creadas' })
    expect(r.roundSetup).toMatchObject({ done: false, text: 'Falta campo o fecha: día 1 y día 2', to: 'rondas' })
    // Nothing to say yet about a card, tees or groups.
    expect(r.card).toBeUndefined()
    expect(r.tees).toBeUndefined()
    expect(r.groups).toBeUndefined()
  })

  it('the days asked for and never created count as missing rounds', () => {
    const r = check('new-setup', (s) => {
      s.rounds = []
    })
    expect(r.rounds).toMatchObject({ done: false, text: 'Faltan 2 rondas por crear', to: 'rondas' })
  })

  it('a set-up tournament is all done', () => {
    const r = check('minimal4-setup')
    expect(Object.values(r).every((i) => i!.done)).toBe(true)
    // One tee on the course: nothing to choose, so no tee line.
    expect(Object.keys(r).sort()).toEqual(['card', 'groups', 'pins', 'players', 'roundSetup', 'rounds'])
  })

  it('players without a PIN are counted; with the PINs unknown the line is left out', () => {
    expect(check('minimal4-setup', undefined, () => ({ pins: new Set(['p1', 'p2']) })).pins).toMatchObject({ done: false, text: 'A 2 jugadores les falta su PIN' })
    expect(check('minimal4-setup', undefined, () => ({ pins: null })).pins).toBeUndefined()
  })

  it('a player with no tee on a course with several tees is counted, and told which tee he would get', () => {
    const r = check('minimal4-setup', (s) => {
      s.courses[0]!.tees.push(makeTee('tee2', s.courses[0]!.id, { name: 'Blancas' }))
      s.players.find((p) => p.id === 'p3')!.defaultTeeId = null
    })
    expect(r.tees).toMatchObject({ done: false, text: '1 jugador sin tee para el día 1: saldría de Azules', to: 'rondas' })
  })

  it('groups: none for the next round, or someone left out; the line opens Grupos on that day', () => {
    expect(check('minimal4-setup', (s) => (s.groups = [])).groups).toMatchObject({ done: false, text: 'Arma los grupos del día 1', to: 'grupos', roundId: 'r1' })
    expect(check('minimal4-setup', (s) => (s.groups[0]!.playerIds = ['p1', 'p2', 'p3'])).groups).toMatchObject({ done: false, text: '1 jugador sin grupo el día 1' })
  })
})

describe('Para empezar: what the first list got wrong', () => {
  it('a single-tee course: players with no tee play it, and nothing nags (P2)', () => {
    const r = check('minimal4-setup', (s) => {
      for (const p of s.players) p.defaultTeeId = null
    })
    expect(r.tees).toBeUndefined()
    expect(Object.values(r).every((i) => i!.done)).toBe(true)
  })

  it('match play: the seeds with a bye need no group on day 1 (P2)', () => {
    const r = check('match8', (s) => {
      // Six players: the bracket gives the top two a bye; the groups are its four matches.
      s.players = s.players.slice(0, 6)
      s.groups = []
      s.scores = []
      const { state } = dataFromSnapshot(s)
      const first = state.bracket!.rounds[0]!
      expect(first.matches.filter((m) => !m.sides[1])).toHaveLength(2)
      first.matches.filter((m) => m.sides[1]).forEach((m, i) => s.groups.push({ id: `g${i}`, roundId: first.roundId!, number: i + 1, teeTime: null, startHole: 1, playerIds: [...m.sides[0].playerIds, ...m.sides[1]!.playerIds] }))
    })
    expect(r.groups).toMatchObject({ done: true, text: 'Grupos del día 1 listos' })
  })

  it('match play: the knocked out need no group in the semifinal (P2)', () => {
    const r = check('bracket8', (s) => {
      const { state } = dataFromSnapshot(s)
      const semis = nextRoundGroups(state.bracket!)!
      semis.groups.forEach((ids, i) => s.groups.push({ id: `semi${i}`, roundId: semis.round.roundId!, number: i + 1, teeTime: null, startHole: 1, playerIds: ids }))
    })
    expect(r.groups).toMatchObject({ done: true, text: 'Grupos del día 2 listos', roundId: 'r2' })
  })

  it('a cancelled round is not a missing one, and is not checked (P3)', () => {
    const r = check('new-setup', (s) => {
      s.rounds[1]!.status = 'cancelled'
    })
    expect(r.rounds).toMatchObject({ done: true, text: '2 rondas creadas' })
    expect(r.roundSetup).toMatchObject({ done: false, text: 'Falta campo o fecha: día 1' })
  })

  it('more rounds than days is flagged, not counted as done (P3)', () => {
    const r = check('new-setup', (s) => {
      s.rounds.push({ ...s.rounds[1]!, id: 'r3', number: 3 })
    })
    expect(r.rounds).toMatchObject({ done: false, text: '3 rondas para un torneo de 2 días: sobra una', to: 'rondas' })
  })

  it('the card is checked on the tee each player plays, not on any tee (P3)', () => {
    const r = check('minimal4-setup', (s) => {
      // A second tee with only nine holes loaded, and one player on it.
      s.courses[0]!.tees.push(makeTee('tee9', s.courses[0]!.id, { name: 'Rojas', holes: s.courses[0]!.tees[0]!.holes.slice(0, 9) }))
      s.players.find((p) => p.id === 'p4')!.defaultTeeId = 'tee9'
    })
    expect(r.card).toMatchObject({ done: false, text: 'Falta la tarjeta del campo (par e índice de golpe): día 1', to: 'campos' })
  })

  it('a card still as «Capturar a mano» left it (par 4 everywhere) is not a card (P3)', () => {
    const r = check('minimal4-setup', (s) => {
      s.courses[0]!.tees[0]!.holes = s.courses[0]!.tees[0]!.holes.map((h) => ({ ...h, par: 4, strokeIndex: h.number }))
    })
    expect(r.card).toMatchObject({ done: false, text: 'La tarjeta sigue como venía, par 4 en todos los hoyos: día 1', to: 'campos' })
  })

  it('an 18-hole round on a 9-hole course sends you to Rondas, where the fix is (P3)', () => {
    const r = check('minimal4-setup', (s) => {
      s.courses[0]!.tees[0]!.holes = s.courses[0]!.tees[0]!.holes.slice(0, 9)
    })
    expect(r.card).toMatchObject({ done: false, text: 'Ronda de 18 hoyos en un campo de 9: día 1', to: 'rondas' })
    // Set the round to nine holes and the card is complete.
    expect(
      check('minimal4-setup', (s) => {
        s.courses[0]!.tees[0]!.holes = s.courses[0]!.tees[0]!.holes.slice(0, 9)
        s.rounds[0]!.holes = 9
      }).card,
    ).toMatchObject({ done: true })
  })

  it('a player confirmed-linked to an account gets in without a PIN (P3)', () => {
    const r = check('minimal4-setup', undefined, () => ({ pins: new Set(['p1', 'p2', 'p3']), linked: new Set(['p4']) }))
    expect(r.pins).toMatchObject({ done: true })
  })

  it('a team format with no teams has a line for them (P3)', () => {
    const r = check('team8', (s) => {
      s.teams = []
      s.pairs = []
    })
    expect(r.teams).toMatchObject({ done: false, text: 'Arma los equipos', to: 'equipos' })
    expect(check('team8').teams).toMatchObject({ done: true, text: '4 equipos armados' })
  })

  it('the Torneo tab counts each open thing once (P3)', () => {
    // A new tournament with players: the engine warns «sin campo cargado» for each day, and the list already says it.
    const fresh = run('new-setup', (s) => {
      s.players = structuredClone(getFixture('minimal4-setup')!.snapshot.players)
    })
    expect(fresh.d.state.flags.warnings.length).toBe(2)
    expect(fresh.d.state.flags.warnings.every(coveredByChecklist)).toBe(true)
    expect(setupBadge(fresh.items, fresh.d.state.flags.warnings, 0)).toBe(fresh.items.filter((i) => !i.done).length)
    // A team format with no teams: the engine's warning and the list's line are one thing.
    const team = run('team8', (s) => {
      s.teams = []
      s.pairs = []
    })
    expect(team.d.state.flags.warnings.some(coveredByChecklist)).toBe(true)
    expect(setupBadge(team.items, team.d.state.flags.warnings.filter(coveredByChecklist), 0)).toBe(team.items.filter((i) => !i.done).length)
    // A warning the list does not cover still counts.
    expect(setupBadge(fresh.items, [...fresh.d.state.flags.warnings, 'La bolsa no cuadra'], 1)).toBe(fresh.items.filter((i) => !i.done).length + 2)
  })
})
