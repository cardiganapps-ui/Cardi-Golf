/**
 * UX-06: «Para empezar» lists what a tournament still needs before its first
 * tee. The wizard asked «¿Cuántos días?» and created no rounds, and nothing
 * told a new organizer what was missing.
 */
import { describe, expect, it } from 'vitest'
import { getFixture } from '../../dev/fixtures'
import { dataFromSnapshot } from '../../data/tournamentStore'
import type { Snapshot } from '../../engine/types'
import { readiness, type ReadinessItem } from './readiness'

function check(name: string, edit?: (s: Snapshot) => void, pins?: (s: Snapshot) => Set<string> | null) {
  const snapshot = structuredClone(getFixture(name)!.snapshot)
  edit?.(snapshot)
  const d = dataFromSnapshot(snapshot)
  const items = readiness(d.snapshot, d.settings, pins ? pins(d.snapshot) : new Set(d.snapshot.players.map((p) => p.id)))
  return Object.fromEntries(items.map((i) => [i.id, i])) as Partial<Record<ReadinessItem['id'], ReadinessItem>>
}

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
    expect(Object.keys(r).sort()).toEqual(['card', 'groups', 'pins', 'players', 'roundSetup', 'rounds', 'tees'])
  })

  it('players without a PIN are counted; with the PINs unknown the line is left out', () => {
    expect(check('minimal4-setup', undefined, () => new Set(['p1', 'p2'])).pins).toMatchObject({ done: false, text: 'A 2 jugadores les falta su PIN' })
    expect(check('minimal4-setup', undefined, () => null).pins).toBeUndefined()
  })

  it('a course without par or stroke index on every hole has no card yet', () => {
    const r = check('minimal4-setup', (s) => {
      for (const tee of s.courses[0]!.tees) tee.holes[4] = { ...tee.holes[4]!, strokeIndex: 0 }
    })
    expect(r.card).toMatchObject({ done: false, text: 'Falta la tarjeta del campo (par e índice de golpe): día 1', to: 'campos' })
  })

  it('a player with no tee on the course of the next round is counted', () => {
    const r = check('minimal4-setup', (s) => {
      s.roundTees = s.roundTees.filter((x) => x.playerId !== 'p3')
      s.players.find((p) => p.id === 'p3')!.defaultTeeId = null
    })
    expect(r.tees).toMatchObject({ done: false, text: '1 jugador sin tee para el día 1: jugaría el primero del campo' })
  })

  it('groups: none for the next round, or someone left out', () => {
    expect(check('minimal4-setup', (s) => (s.groups = [])).groups).toMatchObject({ done: false, text: 'Arma los grupos del día 1', to: 'grupos' })
    expect(check('minimal4-setup', (s) => (s.groups[0]!.playerIds = ['p1', 'p2', 'p3'])).groups).toMatchObject({ done: false, text: '1 jugador sin grupo el día 1' })
  })

  it('a cancelled round is neither missing nor checked', () => {
    const r = check('new-setup', (s) => {
      s.rounds[1]!.status = 'cancelled'
    })
    expect(r.roundSetup).toMatchObject({ done: false, text: 'Falta campo o fecha: día 1' })
  })
})
