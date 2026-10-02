/**
 * The feed speaks the main event's language (STRAT-03). Before, every format
 * replayed Stableford points: a match-play board led by Matías had a feed
 * crowning Fabián «con 34», a team board led by a team crowned a player, and
 * a stroke-play event read «+4 pts» under every birdie.
 */
import { describe, expect, it } from 'vitest'
import { getFixture } from '../../dev/fixtures'
import { computeTournament } from '../computeTournament'
import { parseSettings, type TournamentSettings } from '../settings/schema'
import type { Snapshot } from '../types'
import type { FeedEvent } from './feed'

function run(name: string, edit?: (s: TournamentSettings, snap: Snapshot) => void) {
  const snap = structuredClone(getFixture(name)!.snapshot)
  const settings = parseSettings(snap.tournament.settings)
  edit?.(settings, snap)
  return { snap, settings, state: computeTournament(snap, settings) }
}
const leads = (feed: FeedEvent[]) => feed.filter((e): e is Extract<FeedEvent, { kind: 'leadChange' }> => e.kind === 'leadChange')

describe('feed: the leader is the board\'s leader', () => {
  it('match play and team play announce no leader: one player\'s running total leads nothing there', () => {
    for (const name of ['match8', 'bracket8', 'team8', 'scramble8']) {
      const { state } = run(name)
      expect(state.feed.length, name).toBeGreaterThan(0)
      expect(leads(state.feed), name).toEqual([])
    }
  })

  it('stroke play: the latest leader is the board\'s leader, with the board\'s figure against par', () => {
    const { state } = run('stroke8')
    const latest = leads(state.feed)[0]!
    const top = state.modules.individual!.rows[0]!
    expect(state.modules.individual!.rows[1]!.position).toBeGreaterThan(1)
    expect(latest.playerId).toBe(top.playerId)
    expect(latest.scoring).toBe('net')
    expect(latest.figure).toMatch(/^(E|\+\d+|−\d+)$/)
  })

  it('Stableford keeps its points: the figure is the leader\'s points total', () => {
    const { state } = run('full12-live')
    const latest = leads(state.feed)[0]!
    expect(latest.scoring).toBe('points')
    expect(latest.figure).toMatch(/^\d+$/)
  })
})

describe('feed: a birdie is a birdie on the score the event counts', () => {
  it('net stroke play: every birdie event is a net score under par, and says by how much', () => {
    const { state } = run('stroke8')
    const birdies = state.feed.filter((e): e is Extract<FeedEvent, { kind: 'birdie' }> => e.kind === 'birdie')
    expect(birdies.length).toBeGreaterThan(0)
    for (const e of birdies) {
      const h = Object.values(state.core.rounds).flatMap((r) => r[e.playerId]?.holes ?? []).find((x) => x.hole === e.hole)!
      expect(e.scoring).toBe('net')
      expect(h.gross! - h.strokesReceived - h.par).toBe(-e.under)
    }
  })

  it('gross stroke play: a net birdie that is a gross par is no birdie', () => {
    const net = run('stroke8')
    const gross = run('stroke8', (s) => (s.modules.individual.formatOptions.scoring = 'gross'))
    const grossBirdies = gross.state.feed.filter((e) => e.kind === 'birdie')
    expect(grossBirdies.length).toBeLessThan(net.state.feed.filter((e) => e.kind === 'birdie').length)
    for (const e of grossBirdies) {
      const h = Object.values(gross.state.core.rounds).flatMap((r) => r[e.playerId]?.holes ?? []).find((x) => x.hole === e.hole)!
      expect(h.gross! - h.par).toBeLessThanOrEqual(-1)
    }
  })

  it('the honoree\'s holes under strokes carry the hole against par, and a pick-up carries none', () => {
    const { state } = run('stroke8', (_s, snap) => {
      snap.players[0]!.isHonoree = true
      // The feed keeps the latest 40 events: pick up on the honoree's last hole, so it is among them.
      const sc = snap.scores.find((x) => x.playerId === snap.players[0]!.id && x.hole === 18)!
      sc.pickedUp = true
      sc.strokes = null
    })
    const own = state.feed.filter((e): e is Extract<FeedEvent, { kind: 'honoreeHole' }> => e.kind === 'honoreeHole')
    expect(own.length).toBeGreaterThan(0)
    expect(own.every((e) => e.scoring === 'net')).toBe(true)
    expect(own.find((e) => e.hole === 18)?.toPar).toBeNull()
    expect(own.some((e) => typeof e.toPar === 'number')).toBe(true)
  })
})
