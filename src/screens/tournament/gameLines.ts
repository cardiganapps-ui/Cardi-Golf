/** A game's lines on Juegos (its stake, who leads), for GameBoardView and the games list; apart so the view's file exports components only (QA-15). */
import { t } from '../../i18n/es-MX'
import type { GameResultState } from '../../engine/games/game'
import type { Msg } from '../../engine/messages'
import { formatMoney } from '../../lib/money'

export function gameStake(g: GameResultState, cur: string): { text: string; amount?: number } {
  const m = g.config.money
  if (m.source === 'side') return { text: t.games.sidePot, amount: g.pot }
  if (m.source === 'main') return { text: t.games.fromMain, amount: g.pot }
  if (m.source === 'direct') return { text: t.games.perBet(formatMoney(m.stake, cur)), amount: m.stake }
  return { text: t.games.justForFun }
}

export function gameLeader(g: GameResultState, name: (id: string) => string, words: (m: Msg) => string): string {
  const row = g.board.sections[0]?.rows[0]
  if (!row) return t.games.noResults
  const who = t.common.andList(row.playerIds.map(name))
  const figure = words(row.figure)
  if (row.title) return `${words(row.title)}: ${who ? `${who}, ` : ''}${figure.toLowerCase()}`
  return t.games.leader(who, row.label ? `${words(row.label)} ${figure}` : figure)
}
