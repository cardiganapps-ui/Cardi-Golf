import { afterEach, describe, expect, it } from 'vitest'
import { computeTournament } from './computeTournament'
import { clearModules, registerModule } from './modules/registry'
import { DEFAULT_SETTINGS, FIRST_TOURNAMENT_SETTINGS } from './settings/presets'
import type { Snapshot } from './types'

function emptySnapshot(playerCount = 0): Snapshot {
  return {
    tournament: {
      id: 't1',
      slug: 'ensayo',
      name: 'Ensayo',
      tagline: null,
      logoUrl: null,
      accentColor: null,
      joinCode: 'ABC123',
      status: 'setup',
      currentRoundId: null,
      bankerPlayerId: null,
      settings: DEFAULT_SETTINGS,
      timezone: 'America/Mazatlan',
      currency: 'MXN',
    },
    players: Array.from({ length: playerCount }, (_, i) => ({
      id: `p${i + 1}`,
      fullName: `Jugador ${i + 1}`,
      displayName: `J${i + 1}`,
      tier: null,
      baseHcp: 18,
      teeId: null,
      isHonoree: false,
      isAdmin: false,
      avatarUrl: null,
      formGuide: null,
      sortOrder: i,
    })),
    courses: [],
    rounds: [],
    groups: [],
    pairs: [],
    scores: [],
    snakeTiebreaks: [],
    cardSignatures: [],
    handicapOverrides: [],
    calcuttaLots: [],
    calcuttaBids: [],
    calcuttaBuybacks: [],
    payments: [],
  }
}

afterEach(() => clearModules())

describe('module seam', () => {
  it('runs only the enabled modules and merges their state', () => {
    registerModule({
      id: 'snake',
      defaultLabel: 'La Víbora',
      compute: () => ({ ran: true }),
      prizes: () => [{ moduleId: 'snake', label: 'x', playerId: 'p1', amount: 200, final: false }],
    })
    registerModule({
      id: 'auction',
      defaultLabel: 'La Calcutta',
      compute: () => ({ ran: true }),
      prizes: () => [],
    })
    const settings = structuredClone(FIRST_TOURNAMENT_SETTINGS)
    settings.modules.auction.enabled = false

    const state = computeTournament(emptySnapshot(2), settings)
    expect(state.modules.snake).toEqual({ ran: true })
    expect(state.modules.auction).toBeUndefined()
    expect(state.prizes).toHaveLength(1)
    // Enabled but not registered yet: reported, never silently dropped.
    expect(state.missingModules).toEqual(['individual', 'bestRound', 'pairs', 'fewestPutts'])
  })

  it('a disabled module leaves no state and moves no money', () => {
    registerModule({
      id: 'snake',
      defaultLabel: 'La Víbora',
      compute: () => ({ ran: true }),
      prizes: () => [{ moduleId: 'snake', label: 'x', playerId: 'p1', amount: 200, final: false }],
    })
    const state = computeTournament(emptySnapshot(2), DEFAULT_SETTINGS)
    expect(state.modules.snake).toBeUndefined()
    expect(state.prizes).toEqual([])
  })
})
