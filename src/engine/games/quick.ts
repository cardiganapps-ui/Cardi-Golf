/**
 * Settings for a Ronda rápida: one round, individual Stableford at full
 * handicap, plus the side games picked as chips. Without money every game is
 * for the glory; with money the main pot is the entry fee times the players,
 * split by places (winner takes all up to three players, 70/30 up to seven,
 * 50/30/20 from eight), and each game keeps its catalog stake or buy-in.
 */
import { DEFAULT_SETTINGS } from '../settings/presets'
import type { TournamentSettings } from '../settings/schema'
import type { GameConfig } from '../settings/games'
import { GAME_ENTRIES } from './catalog'

export const QUICK_GAMES = ['skins', 'closest', 'birdies', 'threePutts', 'lowNet'] as const
export type QuickGame = (typeof QUICK_GAMES)[number]

export interface QuickOptions {
  games: QuickGame[]
  money: boolean
  /** Per player, in the tournament currency. Ignored without money. */
  entryFee: number
  players: number
}

export function quickSplit(players: number): number[] {
  if (players <= 3) return [100]
  if (players <= 7) return [70, 30]
  return [50, 30, 20]
}

export function quickSettings(o: QuickOptions): TournamentSettings {
  const base = structuredClone(DEFAULT_SETTINGS)
  const fee = o.money ? Math.max(0, Math.round(o.entryFee)) : 0
  const games: GameConfig[] = o.games.map((key) => {
    const g = GAME_ENTRIES.find((e) => e.key === key)!.create(key.toLowerCase())
    return o.money ? g : ({ ...g, money: { ...g.money, source: 'none' } } as GameConfig)
  })
  return {
    ...base,
    rounds: 1,
    entryFee: fee,
    handicap: { ...base.handicap, allowance: 1 },
    prizes: { ...base.prizes, stableford: fee > 0 ? quickSplit(o.players) : [], stablefordMode: fee > 0 ? 'percent' : 'amount' },
    games,
  }
}
