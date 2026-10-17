/**
 * The game catalog the setup screens show: every game a tournament can turn
 * on, grouped, with a factory for a new instance. The six original games
 * (`settings.modules`) are listed too so the organizer sees one catalog.
 * Each entry's title and blurb are copy, by its id or key (`t.setup.catalog`,
 * ARCH-05); a factory's `label` is settings data, what a new game stores.
 */
import type { ModuleId } from '../settings/schema'
import type { GameConfig, GameMoney, GameType } from '../settings/games'

export type CatalogCategory = 'main' | 'hole' | 'round' | 'matches' | 'specials' | 'free'

export interface ModuleEntry {
  kind: 'module'
  id: ModuleId
  category: CatalogCategory
  /** Needs setup after players exist (draw, auction night): the card says where. */
  later?: true
}

export interface GameEntry {
  kind: 'game'
  /** Catalog key; several entries can share a type (skins neto / gross are one entry). */
  key: string
  type: GameType
  category: CatalogCategory
  /** Its matches are set up after players exist, in Comité. */
  later?: true
  create: (id: string) => GameConfig
}

const m = (over: Partial<GameMoney>): GameMoney => ({ source: 'none', buyIn: 0, amount: 0, stake: 0, split: [100], ...over })
const base = { enabled: true, rounds: 'all' as const, entrants: 'all' as const }

export const MODULE_ENTRIES: ModuleEntry[] = [
  { kind: 'module', id: 'individual', category: 'main' },
  { kind: 'module', id: 'bestRound', category: 'round' },
  { kind: 'module', id: 'pairs', category: 'matches', later: true },
  { kind: 'module', id: 'snake', category: 'hole' },
  { kind: 'module', id: 'fewestPutts', category: 'specials' },
  { kind: 'module', id: 'auction', category: 'specials', later: true },
]

export const GAME_ENTRIES: GameEntry[] = [
  {
    kind: 'game',
    key: 'skins',
    type: 'skins',
    category: 'hole',
    create: (id) => ({ ...base, id, type: 'skins', label: 'Skins', options: { basis: 'net', carryOver: true }, money: m({ source: 'side', buyIn: 200 }) }),
  },
  {
    kind: 'game',
    key: 'birdies',
    type: 'eventPot',
    category: 'hole',
    create: (id) => ({ ...base, id, type: 'eventPot', label: 'Birdies', options: { event: 'birdie', basis: 'gross' }, money: m({ source: 'direct', stake: 50 }) }),
  },
  {
    kind: 'game',
    key: 'threePutts',
    type: 'eventPot',
    category: 'hole',
    create: (id) => ({ ...base, id, type: 'eventPot', label: 'Tres putts', options: { event: 'threePutt', basis: 'gross' }, money: m({ source: 'direct', stake: 20 }) }),
  },
  {
    kind: 'game',
    key: 'lowNet',
    type: 'lowScore',
    category: 'round',
    create: (id) => ({ ...base, id, type: 'lowScore', label: 'Low neto', options: { basis: 'net', scope: 'perRound' }, money: m({ source: 'side', buyIn: 100, split: [100] }) }),
  },
  {
    kind: 'game',
    key: 'nassau',
    type: 'match',
    category: 'matches',
    later: true,
    create: (id) => ({ ...base, id, type: 'match', label: 'Nassau', options: { format: 'nassau', basis: 'net', pairScoring: 'bestBall', pressAt: 2, maxPresses: 1, matches: [] }, money: m({ source: 'direct', stake: 100 }) }),
  },
  {
    kind: 'game',
    key: 'closest',
    type: 'contest',
    category: 'specials',
    create: (id) => ({ ...base, id, type: 'contest', label: 'Más cerca del hoyo', options: { kind: 'closest', holes: 'par3' }, money: m({ source: 'side', buyIn: 100 }) }),
  },
  {
    kind: 'game',
    key: 'longDrive',
    type: 'contest',
    category: 'specials',
    create: (id) => ({ ...base, id, type: 'contest', label: 'Drive más largo', options: { kind: 'longDrive', holes: [18] }, money: m({ source: 'direct', stake: 50 }) }),
  },
  {
    kind: 'game',
    key: 'greenies',
    type: 'contest',
    category: 'specials',
    create: (id) => ({ ...base, id, type: 'contest', label: 'Greenies', options: { kind: 'greenie', holes: 'par3' }, money: m({ source: 'direct', stake: 20 }) }),
  },
  {
    kind: 'game',
    key: 'custom',
    type: 'custom',
    category: 'free',
    create: (id) => ({ ...base, id, type: 'custom', label: 'Apuesta libre', options: { description: '' }, money: m({ source: 'direct', stake: 100 }) }),
  },
]

/** Which catalog entry an instance belongs to (for grouping on screen). */
export function entryOf(g: GameConfig): GameEntry {
  if (g.type === 'eventPot') return GAME_ENTRIES.find((e) => e.key === (g.options.event === 'threePutt' ? 'threePutts' : 'birdies'))!
  if (g.type === 'contest') return GAME_ENTRIES.find((e) => e.key === (g.options.kind === 'longDrive' ? 'longDrive' : g.options.kind === 'greenie' || g.options.kind === 'sandy' ? 'greenies' : 'closest'))!
  return GAME_ENTRIES.find((e) => e.type === g.type)!
}

/** A short unique id for a new instance ("skins", "skins-2"...). */
export function newGameId(existing: GameConfig[], key: string): string {
  const slug = key.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 24)
  const ids = new Set(existing.map((g) => g.id))
  if (!ids.has(slug)) return slug
  for (let i = 2; ; i++) if (!ids.has(`${slug}-${i}`)) return `${slug}-${i}`
}
