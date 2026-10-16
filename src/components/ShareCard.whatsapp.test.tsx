// @vitest-environment happy-dom
/**
 * PWA-06: what the group sees in WhatsApp. The leaderboard card put every peso
 * a person collects (Calcutta returns included) beside his Stableford place
 * under «si terminara ahora», so 7th place «won» $6,600; a 60-player board was
 * a 1080×6134 strip; the settlement card greyed out the winners and never said
 * who pays whom. Money now lives on the settlement card only, with its payment
 * lines as Dinero shows them; no card lists more than it can show whole; every
 * card carries the event's accent and a footer link, never a tournament's own
 * link from a member's phone (§7).
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('./shareAction', () => ({ shareCard: vi.fn(() => new Promise(() => undefined)) }))

import { getFixture } from '../dev/fixtures'
import { dataFromSnapshot, useTournament } from '../data/tournamentStore'
import { nearestAccent } from '../design/accents'
import { t } from '../i18n/es-MX'
import { formatMoney } from '../lib/money'
import type { TournamentCtx } from '../screens/tournament/tournamentContext'
import { TournamentContext } from '../screens/tournament/tournamentContext'
import { CARD_ROWS, ShareCardButton, type ShareKind } from './ShareCard'

function draw(fixture: string, what: ShareKind, ctx: Partial<TournamentCtx> = {}) {
  const fx = getFixture(fixture)!
  const snap = structuredClone(fx.snapshot)
  useTournament.setState({ tournamentId: `fixture:${fixture}`, data: dataFromSnapshot(snap), loading: false, error: null, realtime: 'off' })
  render(
    <MemoryRouter>
      <TournamentContext.Provider value={{ tournamentId: snap.tournament.id, slug: `_/${fixture}`, lookup: fx.lookup, me: fx.me, refresh: async () => undefined, leave: async () => undefined, ...ctx }}>
        <ShareCardButton what={what} />
      </TournamentContext.Provider>
    </MemoryRouter>,
  )
  fireEvent.click(screen.getByRole('button'))
  const node = document.querySelector<HTMLElement>(`[data-share-card="${what.kind}"]`)!
  return { node, card: within(node), state: useTournament.getState().data!.state, snap }
}

afterEach(() => cleanup())

describe('the leaderboard card (PWA-06)', () => {
  it('shows no money and no «si terminara ahora»: a place is a place', () => {
    const { node } = draw('full12-live', { kind: 'leaderboard' })
    expect(node.textContent).not.toMatch(/\$/)
    expect(node.textContent).not.toContain(t.money.ifEndedNow)
  })

  it('lists the first ten and the sharer, and says how many more the app has', () => {
    // large60's phone is p17's, further down than tenth.
    const { node, card, state } = draw('large60', { kind: 'leaderboard' })
    const rows = state.modules.individual!.rows
    const mine = rows.find((r) => r.playerId === 'p17')!
    expect(rows.indexOf(mine)).toBeGreaterThanOrEqual(CARD_ROWS)
    const shown = node.querySelectorAll('[class*="row"]:not([class*="rows"])')
    expect(shown).toHaveLength(CARD_ROWS + 1)
    expect(shown[CARD_ROWS]!.textContent).toContain(mine.label)
    expect(card.getByText(t.share.more(rows.length - CARD_ROWS - 1))).toBeTruthy()
  })

  it('carries the event accent on the rule under its name', () => {
    const { node, snap } = draw('large60', { kind: 'leaderboard' })
    expect(node.dataset.accent).toBe(nearestAccent(snap.tournament.accentColor).id)
  })
})

describe('the settlement card (PWA-06)', () => {
  it('says who pays whom, vía banco, with each amount', () => {
    const { card, state, snap } = draw('full12-finished', { kind: 'settlement' })
    expect(card.getByText(t.moneyScreen.viaBank)).toBeTruthy()
    const name = (id: string | null) => (id ? snap.players.find((p) => p.id === id)!.displayName : null)
    const first = state.money.viaBank.find((tr) => tr.amount > 0 && tr.from === null && tr.to !== null)!
    const line = card.getByText(t.moneyScreen.payText(t.moneyScreen.payWords(name(first.from), name(first.to)))).parentElement!
    expect(line.textContent).toContain(formatMoney(first.amount))
  })

  it('sin banco when Dinero shows it so: the peer-to-peer lines', () => {
    const { card, state } = draw('full12-finished', { kind: 'settlement', settle: 'p2p' })
    expect(card.getByText(t.moneyScreen.p2p)).toBeTruthy()
    const lines = state.money.peerToPeer.filter((tr) => tr.amount > 0)
    expect(lines.length).toBeGreaterThan(0)
    for (const tr of lines.slice(0, 3)) expect(card.getAllByText(formatMoney(tr.amount)).length).toBeGreaterThan(0)
  })

  it('a winner’s net is in ink, a loser’s in red: never the grey of a place number', () => {
    const { node, state } = draw('full12-finished', { kind: 'settlement' })
    const best = Object.values(state.money.people).sort((a, b) => b.net - a.net)[0]!
    const worst = Object.values(state.money.people).sort((a, b) => a.net - b.net)[0]!
    const cell = (text: string) => [...node.querySelectorAll('span')].find((s) => s.textContent === text)!
    expect(cell(`+${formatMoney(best.net)}`).className).toMatch(/gain/)
    expect(cell(`−${formatMoney(-worst.net)}`).className).toMatch(/loss/)
    expect(cell(`+${formatMoney(best.net)}`).className).not.toMatch(/\bpos\b|_pos_/)
  })
})

describe('the footer link (PWA-06, §7)', () => {
  it('from a member’s phone: Polo’s own address, never the tournament’s', () => {
    const { node } = draw('full12-finished', { kind: 'settlement' })
    const link = node.querySelector('[data-card-link]')!.textContent
    expect(link).toBe(location.host)
    expect(node.textContent).not.toContain('/t/')
  })

  it('from a link to watch: that link', () => {
    const { node } = draw('full12-live', { kind: 'leaderboard' }, { spectator: { money: false, url: 'https://polo.example/v/abcdefghijklmnopqrstuvwx' } })
    expect(node.querySelector('[data-card-link]')!.textContent).toBe(t.spectator.cardLink('polo.example/v/abcdefghijklmnopqrstuvwx'))
  })

  it('from the example tournament: the example', () => {
    const { node } = draw('full12-live', { kind: 'leaderboard' }, { spectator: { money: true, url: 'https://polo.example/demo', demo: true } })
    expect(node.querySelector('[data-card-link]')!.textContent).toBe(t.share.demoLink('polo.example/demo'))
  })
})
