/**
 * COPY-15: the feed had four fixed templates, repeated verbatim («Leonel:
 * águila neta en el 6, +4 pts», «Leonel: águila neta en el 4, +4 pts»…).
 * Now each kind has a few lines, a birdie run and the day's first have their
 * own, a three-putt is said where no snake says it, and a lead change names
 * whom it took the lead from. The pick is the event's own: every phone shows
 * the same words, a recompute changes none, and a new event never rewrites
 * an older line.
 */
import { describe, expect, it } from 'vitest'
import { FIXTURE_NAMES, getFixture } from '../dev/fixtures'
import { computeTournament } from '../engine/computeTournament'
import type { FeedEvent } from '../engine/core/feed'
import { DEFAULT_SETTINGS, FIRST_TOURNAMENT_SETTINGS } from '../engine/settings/presets'
import { parseSettings, type TournamentSettings } from '../engine/settings/schema'
import { makeGroup, makePlayer, makeSnapshot, score } from '../engine/testing/fixtures'
import { t } from '../i18n/es-MX'
import { feedLines, feedPicks, feedText, feedWords } from './figureText'

const fixtures = FIXTURE_NAMES.map((name) => {
  const snap = getFixture(name)!.snapshot
  const settings = parseSettings(snap.tournament.settings)
  const nameOf = (id: string) => snap.players.find((p) => p.id === id)?.displayName ?? '?'
  return { name, snap, settings, nameOf, feed: computeTournament(snap, settings).feed }
})

describe('the feed’s lines (COPY-15)', () => {
  it('are the same on every phone and every recompute', () => {
    for (const f of fixtures) {
      const again = computeTournament(structuredClone(f.snap), f.settings).feed
      expect(feedLines(again, f.nameOf, feedWords(f.settings)), f.name).toEqual(feedLines(f.feed, f.nameOf, feedWords(f.settings)))
    }
  })

  it('a new event on top never rewrites the lines under it', () => {
    for (const f of fixtures.filter((x) => x.feed.length > 0)) {
      const before = feedLines(f.feed, f.nameOf, feedWords(f.settings))
      const top = f.feed[0]!
      const arrived: FeedEvent = { ...top, hole: top.hole + 100 }
      expect(feedLines([arrived, ...f.feed], f.nameOf, feedWords(f.settings)).slice(1), f.name).toEqual(before)
    }
  })

  it('two lines in a row never take the same words from the same set', () => {
    let pairs = 0
    for (const f of fixtures) {
      const picks = feedPicks(f.feed, f.nameOf, feedWords(f.settings))
      for (let i = 1; i < picks.length; i++) {
        if (picks[i]!.set !== picks[i - 1]!.set) continue
        pairs++
        expect(picks[i]!.pick, `${f.name}: «${picks[i - 1]!.line}» then «${picks[i]!.line}»`).not.toBe(picks[i - 1]!.pick)
      }
    }
    expect(pairs).toBeGreaterThan(10)
  })

  it('has a voice: the first tournament’s feed reads in more than one way', () => {
    const f = fixtures.find((x) => x.name === 'full12-live')!
    const shown = feedPicks(f.feed, f.nameOf, feedWords(f.settings)).slice(0, 10)
    expect(new Set(shown.map((p) => `${p.set}:${p.pick}`)).size).toBeGreaterThan(3)
  })

  it('never talks money, and names only the board’s people', () => {
    for (const f of fixtures) {
      const names = new Set(f.snap.players.map((p) => p.displayName))
      for (const e of f.feed) {
        for (const v of [0, 1, 2, 3]) {
          const line = feedText(e, f.nameOf, feedWords(f.settings), v)
          expect(line, f.name).not.toMatch(/\$|peso|cobra|paga/i)
          expect(names.has(f.nameOf(e.playerId)), f.name).toBe(true)
          expect(line).toContain(f.nameOf(e.playerId))
        }
      }
    }
  })

  it('calls the snake by the tournament’s own name (STRAT-11)', () => {
    const e: FeedEvent = { kind: 'snakePass', at: null, roundNumber: 1, hole: 14, playerId: 'p1', groupNumber: 1 }
    const words = feedWords({ ...FIRST_TOURNAMENT_SETTINGS, modules: { ...FIRST_TOURNAMENT_SETTINGS.modules, snake: { ...FIRST_TOURNAMENT_SETTINGS.modules.snake, label: 'El Tres Putts' } } })
    for (const v of [0, 1, 2]) {
      const line = feedText(e, () => 'René', words, v)
      expect(line).not.toMatch(/víbora/i)
      expect(line).toMatch(/Tres Putts/)
    }
    expect(feedText(e, () => 'René', feedWords(FIRST_TOURNAMENT_SETTINGS), 1)).toBe('René se lleva la Víbora en el 14')
  })

  it('the honoree is called by his role only when the organizer named one', () => {
    const e: FeedEvent = { kind: 'honoreeHole', at: null, roundNumber: 1, hole: 3, playerId: 'p1', points: 2, toPar: 0, scoring: 'points' }
    expect(feedText(e, () => 'Nacho', feedWords(FIRST_TOURNAMENT_SETTINGS), 1)).toBe('Nacho, el novio, suma 2 pts en el 3')
    expect(feedText(e, () => 'Nacho', feedWords(DEFAULT_SETTINGS), 1)).toBe('Nacho suma 2 pts en el 3')
  })
})

describe('the events behind the lines (COPY-15)', () => {
  /** Four players, one day, saved hole by hole in order; `card` gives each player's strokes and putts per hole. */
  function day(settings: TournamentSettings, card: (pid: string, hole: number, par: number) => [number, number]) {
    const snap = makeSnapshot({ settings, rounds: 1, players: [1, 2, 3, 4].map((i) => makePlayer(i, { baseHcp: 0 })) })
    snap.groups.push(makeGroup('r1', 1, ['p1', 'p2', 'p3', 'p4']))
    const holes = snap.courses[0]!.tees[0]!.holes
    let n = 0
    for (const h of holes) {
      for (const pid of ['p1', 'p2', 'p3', 'p4']) {
        const [strokes, putts] = card(pid, h.number, h.par)
        snap.scores.push({ ...score('r1', pid, h.number, strokes, putts), updatedAt: `2027-05-15T10:${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n++ % 60).padStart(2, '0')}Z` })
      }
    }
    return computeTournament(snap, settings).feed
  }

  it('the day’s first birdie, and a run on consecutive holes', () => {
    // p1 birdies holes 3, 4 and 5; p2 birdies hole 8.
    const feed = day(DEFAULT_SETTINGS, (pid, hole, par) => [pid === 'p1' && hole >= 3 && hole <= 5 ? par - 1 : pid === 'p2' && hole === 8 ? par - 1 : par, 2])
    const birdies = feed.filter((e): e is Extract<FeedEvent, { kind: 'birdie' }> => e.kind === 'birdie').reverse()
    expect(birdies.map((b) => [b.playerId, b.hole, b.firstOfDay ?? false, b.streak ?? 1])).toEqual([
      ['p1', 3, true, 1],
      ['p1', 4, false, 2],
      ['p1', 5, false, 3],
      ['p2', 8, false, 1],
    ])
    expect(feedText(birdies[2]!, () => 'Camilo')).toBe('Camilo no para: birdie en el 5, 3 hoyos seguidos bajo par, +3 pts')
    expect(feedText(birdies[0]!, () => 'Camilo')).toBe('Camilo estrena el día con un birdie en el 3, +3 pts')
  })

  it('a three-putt is said where no snake is played, never on the honoree’s hole', () => {
    const feed = day(DEFAULT_SETTINGS, (pid, hole, par) => [par + (pid === 'p3' && hole === 6 ? 1 : 0), pid === 'p3' && hole === 6 ? 3 : 2])
    expect(feed.filter((e) => e.kind === 'threePutt').map((e) => [e.playerId, e.hole])).toEqual([['p3', 6]])
    expect(feedText(feed.find((e) => e.kind === 'threePutt')!, () => 'Damián')).toBe('Damián: 3 putts en el 6. El green ganó esta vez.')
    const withSnake = { ...DEFAULT_SETTINGS, modules: { ...DEFAULT_SETTINGS.modules, snake: { ...DEFAULT_SETTINGS.modules.snake, enabled: true } } }
    expect(day(withSnake, (pid, hole, par) => [par + (pid === 'p3' && hole === 6 ? 1 : 0), pid === 'p3' && hole === 6 ? 3 : 2]).some((e) => e.kind === 'threePutt')).toBe(false)
  })

  it('a lead change names whom it took the lead from', () => {
    // p1 leads after hole 1, p2 takes it with a birdie on 2.
    const feed = day(DEFAULT_SETTINGS, (pid, hole, par) => [pid === 'p1' && hole === 1 ? par - 1 : pid === 'p2' && (hole === 2 || hole === 3) ? par - 1 : par, 2])
    const leads = feed.filter((e): e is Extract<FeedEvent, { kind: 'leadChange' }> => e.kind === 'leadChange').reverse()
    expect(leads[0]!.previous).toBeUndefined()
    expect(leads[1]).toMatchObject({ playerId: 'p2', previous: 'p1' })
    expect(feedText(leads[1]!, (id) => (id === 'p1' ? 'Camilo' : 'Damián'), undefined, 1)).toMatch(/^Damián le quita la punta a Camilo, con \d+$/)
  })

  it('every line follows the copy rules of the feed: words only, the name first or after a phrase', () => {
    for (const lines of [t.feed.threePutt('X', 1, 3), t.feed.snakePass('X', 1, 'La Víbora'), t.feed.leadChange('X', '34', 'Y'), t.feed.underParPoints('X', 1, 4, false, { streak: 2 })]) {
      for (const l of lines) expect(l).not.toMatch(/[·→]|"/)
    }
  })
})
