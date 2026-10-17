/**
 * Hole contests: closest to the pin, long drive, greenie, sandy or a custom
 * one, on the par 3s, chosen holes or every hole. Each group marks its winner
 * on the Tarjeta (`hole_awards`); the Comité can set or change any hole.
 *
 * Closest, long drive and custom have one winner per hole across the field:
 * when two groups each claim a different winner the hole is in dispute and
 * pays nothing until the Comité picks one. Greenies and sandies can have a
 * winner per group, and only count with par or better on that hole.
 *
 * Money: a pot is split by holes won; direct bets pay `stake` from every
 * other entrant per hole won.
 */
import type { GameOf } from '../../settings/games'
import { msg, say, type Msg } from '../../messages'
import type { HoleAward, Id } from '../../types'
import { isGameOf, type GameContext, type GameImpl, type GameResultState } from '../game'
import { directUnits, payUnits, potNote, refundUnwon, unwonWarning } from '../payout'
import { holeOf, moneyByPlayer, namer, rankedUnits, roundHoles, roundNumberOf } from '../util'

type Cfg = GameOf<'contest'>

export const CONTEST_SINGLE: Record<Cfg['options']['kind'], boolean> = { closest: true, longDrive: true, custom: true, greenie: false, sandy: false }

export interface ContestHole {
  roundId: Id
  roundNumber: number
  hole: number
  winners: Id[]
  status: 'won' | 'open' | 'disputed'
  /** Claims ignored because the player did not make par or better (greenie, sandy). */
  voided: Id[]
  claims: Id[]
}

export interface ContestState {
  holes: ContestHole[]
  units: Record<Id, number>
}

/** The contest's holes in a round, read from the first entrant's card (par 3s, a list, or all). */
export function contestHoles(ctx: GameContext<Cfg>, roundId: Id): number[] {
  const n = roundHoles(ctx, roundId)
  const sel = ctx.config.options.holes
  if (sel === 'all') return Array.from({ length: n }, (_, i) => i + 1)
  if (Array.isArray(sel)) return sel.filter((h) => h <= n)
  const ref = ctx.entrants.map((id) => ctx.core.rounds[roundId]?.[id]).find(Boolean)
  return (ref?.holes ?? []).filter((h) => h.par === 3).map((h) => h.hole)
}

/** A game's contest state, when the game is a contest (narrowed by its type: no cast, ARCH-15). */
export function contestStateOf(g: GameResultState | undefined): ContestState | undefined {
  return g && isGameOf(g, 'contest') ? g.state : undefined
}

/** A Comité ruling on a hole contest: it overrides the groups' claims on its hole (0042 keeps the two apart: DB-03, DB-04). */
export const isRuling = (a: HoleAward): boolean => (a.source ? a.source === 'comite' : a.groupId == null)

export const contestGame: GameImpl<ContestState, Cfg> = {
  type: 'contest',
  defaultLabel: 'Más cerca del hoyo',
  compute(ctx) {
    const kind = ctx.config.options.kind
    const single = CONTEST_SINGLE[kind]
    const inGame = new Set(ctx.entrants)
    const units: Record<Id, number> = Object.fromEntries(ctx.entrants.map((id) => [id, 0]))
    const holes: ContestHole[] = []
    for (const rid of ctx.roundIds) {
      for (const hole of contestHoles(ctx, rid)) {
        const rows = ctx.snapshot.holeAwards.filter((a) => a.roundId === rid && a.gameId === ctx.config.id && a.hole === hole && inGame.has(a.playerId))
        // A Comité ruling overrides the groups' claims.
        const comite = rows.filter(isRuling)
        const claims = [...new Set((comite.length ? comite : rows).map((a) => a.playerId))]
        const voided: Id[] = []
        let winners = claims
        if (kind === 'greenie' || kind === 'sandy') {
          winners = claims.filter((id) => {
            const h = holeOf(ctx, rid, id, hole)
            const ok = !!h?.played && !h.pickedUp && h.gross != null && h.gross <= h.par
            if (!ok && h?.played) voided.push(id)
            return ok || !h?.played
          })
        }
        const disputed = single && winners.length > 1
        const status: ContestHole['status'] = disputed ? 'disputed' : winners.length ? 'won' : 'open'
        if (status === 'won') for (const id of winners) units[id] = (units[id] ?? 0) + 1
        holes.push({ roundId: rid, roundNumber: roundNumberOf(ctx, rid), hole, winners, status, voided, claims })
      }
    }
    return { holes, units }
  },
  prizes(state, ctx) {
    const units = new Map(Object.entries(state.units))
    const name = namer(ctx)
    const unit = 'hole'
    if (ctx.config.money.source === 'direct') return directUnits(ctx, units, 'reward', unit, name)
    const paid = payUnits(ctx, units, unit, name)
    // A hole still in dispute may yet have a winner: the Comité decides it first.
    return paid.length || state.holes.some((h) => h.status === 'disputed') ? paid : refundUnwon(ctx, 'hole')
  },
  board(state, ctx) {
    const name = namer(ctx)
    const money = moneyByPlayer(contestGame.prizes(state, ctx))
    const rows = rankedUnits(Object.entries(state.units).filter(([, u]) => u > 0)).map(({ id, units: u, label }) => ({ playerIds: [id], pos: label, figure: msg('board.units', { n: u, unit: 'hole' }), money: money.get(id) ?? 0 }))
    const multi = ctx.roundIds.length > 1
    const log = state.holes.map((h) => ({
      title: msg('board.hole', { day: multi ? h.roundNumber : null, hole: h.hole }),
      playerIds: h.status === 'won' ? h.winners : [],
      pos: null,
      figure: say(h.status === 'won' ? 'board.won' : h.status === 'disputed' ? 'board.disputed' : 'board.pending'),
      sub: h.status === 'disputed' ? msg('board.claims', { names: h.claims.map(name) }) : h.voided.length ? msg('board.voided', { names: h.voided.map(name) }) : undefined,
    }))
    const notes: Msg[] = []
    if (ctx.config.money.source === 'direct') notes.push(msg('board.holeStake', { stake: ctx.config.money.stake }))
    else if (ctx.pot > 0) notes.push(potNote(ctx.config, ctx.pot, 'holes'))
    if (state.holes.some((h) => h.status === 'disputed')) notes.push(say('board.disputedNote'))
    return { sections: [{ rows }, { title: say('board.byHole'), rows: log }], notes }
  },
  warnings(state, ctx) {
    const d = state.holes.filter((h) => h.status === 'disputed')
    if (d.length) return [msg('contest.disputed', { label: ctx.config.label, holes: d.map((h) => h.hole) })]
    return Object.values(state.units).some((u) => u > 0) ? [] : unwonWarning(ctx, 'hole')
  },
}
