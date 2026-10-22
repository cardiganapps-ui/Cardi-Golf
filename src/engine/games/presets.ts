/**
 * Starting points for "Nuevo torneo". Each preset is a full, valid settings
 * object the organizer then edits game by game. Amounts are in the
 * tournament's currency; percent splits make the main pot balance for any
 * field size.
 */
import { DEFAULT_SETTINGS, FIRST_TOURNAMENT_SETTINGS } from '../settings/presets'
import type { TournamentSettings } from '../settings/schema'
import type { GameConfig } from '../settings/games'
import { GAME_ENTRIES } from './catalog'

export type PresetId = 'friends' | 'serious' | 'fun' | 'blank' | 'calcutta'

/** A preset's name and blurb are copy, by its id (`t.setup.presets`, ARCH-05). */
export interface Preset {
  id: PresetId
  players: number
  build: () => TournamentSettings
}

const game = (key: string, over: Partial<GameConfig> = {}): GameConfig =>
  ({ ...GAME_ENTRIES.find((e) => e.key === key)!.create(key.toLowerCase()), ...over }) as GameConfig

export const PRESETS: Preset[] = [
  {
    id: 'friends',
    players: 8,
    build: () => ({
      ...structuredClone(DEFAULT_SETTINGS),
      rounds: 2,
      entryFee: 500,
      prizes: { ...DEFAULT_SETTINGS.prizes, stableford: [50, 30, 20], stablefordMode: 'percent' },
      games: [game('skins'), game('nassau'), game('closest'), game('threePutts')],
    }),
  },
  {
    id: 'serious',
    players: 16,
    build: () => ({
      ...structuredClone(DEFAULT_SETTINGS),
      rounds: 2,
      entryFee: 1500,
      modules: {
        ...structuredClone(DEFAULT_SETTINGS.modules),
        bestRound: { enabled: true, label: 'Mejor ronda' },
        fewestPutts: { enabled: true, label: 'Menos putts' },
      },
      prizes: {
        ...DEFAULT_SETTINGS.prizes,
        stableford: [50, 25, 15, 10],
        stablefordMode: 'percent',
        bestRoundPerDay: 1000,
        fewestPutts: 1000,
      },
      games: [
        game('lowNet', {
          id: 'low-gross',
          label: 'Low gross',
          options: { basis: 'gross', scope: 'overall' },
          money: { source: 'side', buyIn: 300, amount: 0, stake: 0, split: [60, 40] },
        }),
      ],
    }),
  },
  {
    id: 'fun',
    players: 8,
    build: () => ({
      ...structuredClone(DEFAULT_SETTINGS),
      entryFee: 0,
      games: [game('skins'), game('birdies'), game('closest')].map((g) => ({
        ...g,
        money: { ...g.money, source: 'none' as const },
      })),
    }),
  },
  {
    id: 'blank',
    players: 8,
    build: () => structuredClone(DEFAULT_SETTINGS),
  },
  {
    id: 'calcutta',
    players: 12,
    build: () => structuredClone(FIRST_TOURNAMENT_SETTINGS),
  },
]
