/**
 * The game catalog the setup screens show: every game a tournament can turn
 * on, grouped, with a plain-Spanish blurb and a factory for a new instance.
 * The six original games (`settings.modules`) are listed too so the organizer
 * sees one catalog.
 */
import type { ModuleId } from '../settings/schema'
import type { GameConfig, GameMoney, GameType } from '../settings/games'

export type CatalogCategory = 'main' | 'hole' | 'round' | 'matches' | 'specials' | 'free'

export const CATEGORY_LABEL: Record<CatalogCategory, string> = {
  main: 'Lo principal',
  hole: 'Por hoyo',
  round: 'Por ronda',
  matches: 'Parejas y partidos',
  specials: 'Premios especiales',
  free: 'Libres',
}

export interface ModuleEntry {
  kind: 'module'
  id: ModuleId
  category: CatalogCategory
  blurb: string
  /** Needs setup after players exist (draw, auction night). */
  later?: string
}

export interface GameEntry {
  kind: 'game'
  /** Catalog key; several entries can share a type (skins neto / gross are one entry). */
  key: string
  type: GameType
  category: CatalogCategory
  title: string
  blurb: string
  later?: string
  create: (id: string) => GameConfig
}

const m = (over: Partial<GameMoney>): GameMoney => ({ source: 'none', buyIn: 0, amount: 0, stake: 0, split: [100], ...over })
const base = { enabled: true, rounds: 'all' as const, entrants: 'all' as const }

export const MODULE_ENTRIES: ModuleEntry[] = [
  { kind: 'module', id: 'individual', category: 'main', blurb: 'Stableford con hándicap: la tabla principal del torneo.' },
  { kind: 'module', id: 'bestRound', category: 'round', blurb: 'Un premio cada día para la mejor ronda en puntos.' },
  { kind: 'module', id: 'pairs', category: 'matches', blurb: 'Parejas fijas que suman sus puntos todo el torneo.', later: 'El sorteo de parejas se hace en Comité.' },
  { kind: 'module', id: 'snake', category: 'hole', blurb: 'La tiene el último que hizo tres putts en su grupo; los demás cobran.' },
  { kind: 'module', id: 'fewestPutts', category: 'specials', blurb: 'Premio para quien haga menos putts en todo el torneo.' },
  { kind: 'module', id: 'auction', category: 'specials', blurb: 'Subasta de jugadores la noche anterior, con su propio bote.', later: 'La subasta se corre en Comité.' },
]

export const GAME_ENTRIES: GameEntry[] = [
  {
    kind: 'game',
    key: 'skins',
    type: 'skins',
    category: 'hole',
    title: 'Skins',
    blurb: 'Cada hoyo lo gana quien hace menos golpes, solo. Empate: se acumula.',
    create: (id) => ({ ...base, id, type: 'skins', label: 'Skins', options: { basis: 'net', carryOver: true }, money: m({ source: 'side', buyIn: 200 }) }),
  },
  {
    kind: 'game',
    key: 'birdies',
    type: 'eventPot',
    category: 'hole',
    title: 'Bote de birdies',
    blurb: 'Cada birdie o mejor cobra. Águilas también se pueden premiar aparte.',
    create: (id) => ({ ...base, id, type: 'eventPot', label: 'Birdies', options: { event: 'birdie', basis: 'gross' }, money: m({ source: 'direct', stake: 50 }) }),
  },
  {
    kind: 'game',
    key: 'threePutts',
    type: 'eventPot',
    category: 'hole',
    title: 'Multa por tres putts',
    blurb: 'Cada tres putts le cuesta al que los hace: le paga a cada uno de los demás.',
    create: (id) => ({ ...base, id, type: 'eventPot', label: 'Tres putts', options: { event: 'threePutt', basis: 'gross' }, money: m({ source: 'direct', stake: 20 }) }),
  },
  {
    kind: 'game',
    key: 'lowNet',
    type: 'lowScore',
    category: 'round',
    title: 'Low gross / low neto',
    blurb: 'La mejor tarjeta del día o del torneo, gross o neta.',
    create: (id) => ({ ...base, id, type: 'lowScore', label: 'Low neto', options: { basis: 'net', scope: 'perRound' }, money: m({ source: 'side', buyIn: 100, split: [100] }) }),
  },
  {
    kind: 'game',
    key: 'nassau',
    type: 'match',
    category: 'matches',
    title: 'Nassau / match play',
    blurb: 'Uno contra uno o parejas: ida, vuelta y total, con presiones.',
    later: 'Los partidos se arman en Comité, Juegos.',
    create: (id) => ({ ...base, id, type: 'match', label: 'Nassau', options: { format: 'nassau', basis: 'net', pairScoring: 'bestBall', pressAt: 2, maxPresses: 1, matches: [] }, money: m({ source: 'direct', stake: 100 }) }),
  },
  {
    kind: 'game',
    key: 'closest',
    type: 'contest',
    category: 'specials',
    title: 'Más cerca del hoyo',
    blurb: 'En los par 3: el grupo marca quién la dejó más cerca.',
    create: (id) => ({ ...base, id, type: 'contest', label: 'Más cerca del hoyo', options: { kind: 'closest', holes: 'par3' }, money: m({ source: 'side', buyIn: 100 }) }),
  },
  {
    kind: 'game',
    key: 'longDrive',
    type: 'contest',
    category: 'specials',
    title: 'Drive más largo',
    blurb: 'En los hoyos que elijas (en fairway).',
    create: (id) => ({ ...base, id, type: 'contest', label: 'Drive más largo', options: { kind: 'longDrive', holes: [18] }, money: m({ source: 'direct', stake: 50 }) }),
  },
  {
    kind: 'game',
    key: 'greenies',
    type: 'contest',
    category: 'specials',
    title: 'Greenies y sandies',
    blurb: 'Green de salida en par 3 (o salir de la trampa) y hacer par o mejor.',
    create: (id) => ({ ...base, id, type: 'contest', label: 'Greenies', options: { kind: 'greenie', holes: 'par3' }, money: m({ source: 'direct', stake: 20 }) }),
  },
  {
    kind: 'game',
    key: 'custom',
    type: 'custom',
    category: 'free',
    title: 'Apuesta libre',
    blurb: 'Lo que se les ocurra: el Comité marca al ganador.',
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
