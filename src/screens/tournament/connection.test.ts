/**
 * REL-21: the connection read inconsistently. With no signal on a phone's copy «Sin señal» showed three
 * times; nothing showed while the live channel joined; «En vivo» showed whenever the join answered. One
 * model now says what the boards are, from facts, and the header shows it (TournamentShell.test.tsx).
 */
import { describe, expect, it } from 'vitest'
import { connectionOf, type ConnectionFacts } from './connection'

const facts = (f: Partial<ConnectionFacts> = {}): ConnectionFacts => ({ online: true, hasData: true, fixture: false, source: 'server', realtime: 'live', fetchFailed: false, ...f })

describe('the connection, from facts (REL-21)', () => {
  it('live: the server’s boards with the live channel joined, and nothing else', () => {
    expect(connectionOf(facts())).toEqual({ kind: 'live', mayBeOld: false })
  })

  it('no signal wins over everything, and the boards may be old', () => {
    for (const source of ['cache', 'server'] as const) {
      for (const realtime of ['off', 'connecting', 'live', 'error'] as const) {
        expect(connectionOf(facts({ online: false, source, realtime }))).toEqual({ kind: 'offline', mayBeOld: true })
      }
    }
  })

  it('the phone’s copy while the live tournament is on its way: connecting, and old', () => {
    expect(connectionOf(facts({ source: 'cache', realtime: 'off' }))).toEqual({ kind: 'connecting', mayBeOld: true })
  })

  it('a fetch that failed over the server’s boards: connecting, and old, even with the channel joined (REL-10)', () => {
    expect(connectionOf(facts({ fetchFailed: true }))).toEqual({ kind: 'connecting', mayBeOld: true })
  })

  it('the channel joining, or joining again after it failed: connecting, never «En vivo», and the boards are fresh', () => {
    // It said nothing while the channel joined, and «Sin actualizaciones en vivo» while it was down.
    expect(connectionOf(facts({ realtime: 'connecting' }))).toEqual({ kind: 'connecting', mayBeOld: false })
    expect(connectionOf(facts({ realtime: 'error' }))).toEqual({ kind: 'connecting', mayBeOld: false })
  })

  it('the server’s boards with no channel at all: connecting (the gate keeps asking until it opens)', () => {
    expect(connectionOf(facts({ realtime: 'off' }))).toEqual({ kind: 'connecting', mayBeOld: false })
  })

  it('no boards yet: nothing to say (the gate shows its own loading)', () => {
    expect(connectionOf(facts({ hasData: false }))).toBeNull()
    expect(connectionOf(facts({ hasData: false, online: false }))).toBeNull()
  })

  it('a design fixture says nothing, unless it acts a state out, and losing the signal still shows, with no age to give', () => {
    expect(connectionOf(facts({ fixture: true, source: null, realtime: 'off' }))).toBeNull()
    expect(connectionOf(facts({ fixture: true, source: null, realtime: 'off', online: false }))).toEqual({ kind: 'offline', mayBeOld: false })
    // `?net=cache` on a fixture: read as a real tournament would be.
    expect(connectionOf(facts({ fixture: true, source: 'cache', realtime: 'off' }))).toEqual({ kind: 'connecting', mayBeOld: true })
  })
})
