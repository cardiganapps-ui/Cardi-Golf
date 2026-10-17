/**
 * An instance game's rules, read from its settings (for Reglamento and the
 * setup catalog), as codes (ARCH-05): every number comes from the config, and
 * the words are `explain`'s («gameRules.*»).
 */
import type { GameConfig } from '../settings/games'
import { msg, say, type Msg } from '../messages'

/** What it is played for: nothing, its own bote, a premio from the bolsa, or a bet between players. */
function moneyLine(g: GameConfig): Msg {
  const m = g.money
  if (m.source === 'none') return say('gameRules.noMoney')
  if (m.source === 'side') return msg('gameRules.side', { buyIn: m.buyIn })
  if (m.source === 'main') return msg('gameRules.main', { amount: m.amount })
  return msg('gameRules.direct', { stake: m.stake, perBet: g.type === 'match' })
}

/** Paid out of its own bote, or a premio from the bolsa (COPY-14). */
const potSide = (g: GameConfig) => g.money.source === 'side'

export function describeGame(g: GameConfig): Msg[] {
  const lines: Msg[] = []
  switch (g.type) {
    case 'skins': {
      const o = g.options
      lines.push(msg('gameRules.skins', { net: o.basis === 'net' }), msg('gameRules.skinsTies', { carry: o.carryOver }))
      if (g.money.source === 'side' || g.money.source === 'main') lines.push(msg('gameRules.skinsPot', { side: potSide(g) }))
      break
    }
    case 'lowScore': {
      const o = g.options
      lines.push(msg('gameRules.lowScore', { basis: o.basis }), msg('gameRules.lowScope', { perRound: o.scope === 'perRound', side: potSide(g) }))
      if (g.money.source !== 'none') lines.push(msg('gameRules.lowSplit', { split: g.money.split }))
      break
    }
    case 'eventPot': {
      const o = g.options
      if (o.event === 'threePutt') lines.push(say('gameRules.threePutt'))
      else lines.push(msg('gameRules.event', { eagle: o.event === 'eagle', net: o.basis === 'net' }))
      if (o.event !== 'threePutt' && g.money.source === 'direct') lines.push(say('gameRules.eventDirect'))
      if (g.money.source === 'side' || g.money.source === 'main') lines.push(msg('gameRules.eventPot', { side: potSide(g) }))
      break
    }
    case 'match': {
      const o = g.options
      lines.push(msg('gameRules.match', { nassau: o.format === 'nassau' }))
      lines.push(msg('gameRules.matchBasis', { net: o.basis === 'net', pairs: o.matches.some((m) => m.a.length > 1) ? o.pairScoring : null }))
      if (o.pressAt > 0) lines.push(msg('gameRules.press', { at: o.pressAt, max: o.maxPresses }))
      lines.push(say('gameRules.matchComite'))
      break
    }
    case 'contest':
      lines.push(msg('gameRules.contest', { kind: g.options.kind, label: g.label, holes: g.options.holes }))
      break
    case 'custom':
      if (g.options.description) lines.push(msg('label', { text: g.options.description }))
      lines.push(say('gameRules.customComite'))
      break
  }
  lines.push(moneyLine(g))
  lines.push(msg('gameRules.rounds', { rounds: g.rounds }))
  if (g.entrants === 'list') lines.push(say('gameRules.list'))
  return lines
}
