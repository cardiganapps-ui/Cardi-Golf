// @vitest-environment happy-dom
/**
 * UX-16: a new player's sheet opened on hándicap 18, the estimate on 85, 92
 * and 100, and «Índice» with nothing typed saved 0. A rushed Comité saved
 * twelve players on numbers nobody gave, and every stroke and point was
 * computed from them. Now the handicap starts empty under every method, and
 * the sheet saves only once someone types it.
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getFixture } from '../../dev/fixtures'
import { dataFromSnapshot, useTournament } from '../../data/tournamentStore'
import { t } from '../../i18n/es-MX'
import { TournamentContext } from '../tournament/tournamentContext'
import { completePlayer, type PlayerDraft } from './playerDraft'

const api = vi.hoisted(() => ({
  upsertPlayer: vi.fn(async () => undefined),
  playersWithPin: vi.fn(async () => new Set<string>()),
}))
vi.mock('../../data/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../data/api')>()),
  upsertPlayer: api.upsertPlayer,
  playersWithPin: api.playersWithPin,
}))
vi.mock('../../data/profiles', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../data/profiles')>()),
  useTournamentProfiles: () => [[], () => undefined],
}))
const { AdminPlayers } = await import('./AdminPlayers')

const P = t.admin.players

function mount() {
  const fx = getFixture('full12-live')!
  useTournament.setState({
    tournamentId: 't-players',
    data: dataFromSnapshot(structuredClone(fx.snapshot)),
    reload: async () => undefined,
  })
  return render(
    <MemoryRouter>
      <TournamentContext.Provider
        value={{
          tournamentId: 't-players',
          slug: 'nacho',
          lookup: fx.lookup,
          me: { playerId: null, isOrganizer: true, isComite: true },
          refresh: async () => undefined,
          leave: async () => undefined,
        }}
      >
        <AdminPlayers />
      </TournamentContext.Provider>
    </MemoryRouter>,
  )
}
const sheet = () => screen.getByRole('dialog', { name: P.add })
const save = () => within(sheet()).getByRole('button', { name: t.common.save }) as HTMLButtonElement
const type = (el: HTMLElement, value: string) => act(async () => fireEvent.change(el, { target: { value } }))
async function newPlayer(name = 'Camilo Duarte') {
  mount()
  await act(async () => fireEvent.click(screen.getByRole('button', { name: P.add })))
  await type(within(sheet()).getByLabelText(P.fullName), name)
}

afterEach(() => {
  cleanup()
  api.upsertPlayer.mockClear()
})

describe('a new player’s handicap is typed, never assumed (UX-16)', () => {
  it('opens with no handicap: Save waits for one, and saves what was typed', async () => {
    await newPlayer()
    expect((within(sheet()).getByLabelText(P.baseHcp) as HTMLInputElement).value).toBe('')
    expect(save().disabled).toBe(true)
    expect(within(sheet()).getByText(P.hcpMissing.manual)).toBeTruthy()
    await type(within(sheet()).getByLabelText(P.baseHcp), '12')
    expect(save().disabled).toBe(false)
    expect(within(sheet()).queryByText(P.hcpMissing.manual)).toBeNull()
    await act(async () => fireEvent.click(save()))
    expect(api.upsertPlayer).toHaveBeenCalledWith(
      't-players',
      expect.objectContaining({ full_name: 'Camilo Duarte', base_hcp: 12, handicap_source: 'manual' }),
    )
  })

  it('«Índice» with nothing typed never saves a scratch golfer', async () => {
    await newPlayer()
    await act(async () => fireEvent.click(within(sheet()).getByRole('radio', { name: P.sourceIndex })))
    expect(save().disabled).toBe(true)
    expect(within(sheet()).getByText(P.hcpMissing.index)).toBeTruthy()
    await type(within(sheet()).getByLabelText(P.index), '8.4')
    expect(save().disabled).toBe(false)
    await act(async () => fireEvent.click(save()))
    expect(api.upsertPlayer).toHaveBeenCalledWith(
      't-players',
      expect.objectContaining({ handicap_source: 'index', handicap_index: 8.4, base_hcp: 8.4 }),
    )
  })

  it('the estimate starts with no scores: all three before it saves', async () => {
    await newPlayer()
    await act(async () => fireEvent.click(within(sheet()).getByRole('radio', { name: P.sourceEstimate })))
    const gross = within(sheet()).getAllByLabelText(P.gross) as HTMLInputElement[]
    expect(gross.map((g) => g.value)).toEqual(['', '', ''])
    expect(save().disabled).toBe(true)
    await type(gross[0]!, '80')
    await type(gross[1]!, '88')
    expect(save().disabled).toBe(true)
    expect(within(sheet()).getByText(P.hcpMissing.estimate)).toBeTruthy()
    await type(gross[2]!, '95')
    expect(save().disabled).toBe(false)
    await act(async () => fireEvent.click(save()))
    const [, saved] = api.upsertPlayer.mock.calls[0] as unknown as [
      string,
      { estimate_inputs: Array<{ gross: number }>; base_hcp: number },
    ]
    expect(saved.estimate_inputs.map((r) => r.gross)).toEqual([80, 88, 95])
    expect(saved.base_hcp).toBeGreaterThan(0)
  })

  it('a player already saved opens with his handicap, ready to save', async () => {
    mount()
    const first = useTournament.getState().data!.snapshot.players[0]!
    await act(async () =>
      fireEvent.click(screen.getAllByRole('button').find((b) => b.textContent?.includes(first.fullName))!),
    )
    const form = screen.getByRole('dialog', { name: t.common.edit })
    expect(Number((within(form).getByLabelText(P.baseHcp) as HTMLInputElement).value)).toBe(first.baseHcp)
    expect((within(form).getByRole('button', { name: t.common.save }) as HTMLButtonElement).disabled).toBe(false)
  })
})

describe('a player’s photo (PWA-16)', () => {
  it('comes from the photos the phone has, or its camera: the picker no longer opens only the front camera', async () => {
    await newPlayer()
    const picker = sheet().querySelector('input[type="file"]')!
    expect(picker.getAttribute('accept')).toBe('image/*')
    expect(picker.hasAttribute('capture')).toBe(false)
  })
})

describe('completePlayer', () => {
  const base: PlayerDraft = {
    full_name: 'Ana',
    display_name: 'Ana',
    tier: null,
    base_hcp: null,
    handicap_source: 'manual',
    handicap_index: null,
    estimate_inputs: null,
    default_tee_id: null,
    is_honoree: false,
    is_admin: false,
    avatar_url: null,
    form_guide: null,
    sort_order: 0,
  }
  const scores = (...g: Array<number | null>) =>
    g.map((gross) => ({ gross, rating: null, slope: null, par: null })) as PlayerDraft['estimate_inputs']

  it('is nothing until the chosen method has its number', () => {
    expect(completePlayer(base)).toBeNull()
    expect(completePlayer({ ...base, handicap_source: 'index' })).toBeNull()
    expect(completePlayer({ ...base, handicap_source: 'estimate', estimate_inputs: scores(80, null, 95) })).toBeNull()
    expect(completePlayer({ ...base, base_hcp: 0 })).toMatchObject({ base_hcp: 0 })
    expect(completePlayer({ ...base, handicap_source: 'index', handicap_index: -1.2 })).toMatchObject({
      handicap_index: -1.2,
    })
  })

  it('keeps three typed scores; a half-typed estimate behind another method is dropped, not saved with gaps', () => {
    expect(
      completePlayer({
        ...base,
        handicap_source: 'estimate',
        estimate_inputs: scores(80, 88, 95),
      })?.estimate_inputs?.map((r) => r.gross),
    ).toEqual([80, 88, 95])
    expect(
      completePlayer({ ...base, base_hcp: 14, estimate_inputs: scores(80, null, null) })?.estimate_inputs,
    ).toBeNull()
  })
})
