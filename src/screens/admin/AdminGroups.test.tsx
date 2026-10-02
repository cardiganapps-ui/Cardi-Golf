// @vitest-environment happy-dom
/**
 * Grupos opens on the day «Para empezar» names (?ronda=), and a bad or
 * cancelled day falls back to the current one (M14). Switching days keeps
 * the address in step, replacing it, so a reload or Back does not land on the
 * day it came in on (N9).
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation, useNavigationType } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import { getFixture } from '../../dev/fixtures'
import { dataFromSnapshot, useTournament } from '../../data/tournamentStore'
import type { Snapshot } from '../../engine/types'
import { t } from '../../i18n/es-MX'
import { AdminGroups } from './AdminGroups'

function Where() {
  const { pathname, search } = useLocation()
  return <output data-testid="where">{`${pathname}${search} ${useNavigationType()}`}</output>
}

/** bracket8: day 1 played and current, days 2 and 3 to come. Opened from Torneo, the way the card's link opens it. */
function mount(search: string, edit?: (s: Snapshot) => void) {
  const snapshot = structuredClone(getFixture('bracket8')!.snapshot)
  edit?.(snapshot)
  useTournament.setState({ tournamentId: 't-groups', data: dataFromSnapshot(snapshot) })
  return render(
    <MemoryRouter initialEntries={['/t/viaje/admin/torneo', `/t/viaje/admin/grupos${search}`]} initialIndex={1}>
      <Routes>
        <Route
          path="/t/viaje/admin/grupos"
          element={
            <>
              <AdminGroups />
              <Where />
            </>
          }
        />
        <Route path="/t/viaje/admin/torneo" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  )
}
const selected = () =>
  screen
    .getAllByRole('tab')
    .filter((x) => x.getAttribute('aria-selected') === 'true')
    .map((x) => x.textContent)
const where = () => screen.getByTestId('where').textContent

afterEach(() => cleanup())

describe('Grupos: the day in the address', () => {
  it('opens on the day asked for, and switching days replaces ?ronda= with the day shown (N9)', async () => {
    mount('?ronda=r2')
    expect(selected()).toEqual([t.round.day(2)])
    await act(async () => fireEvent.click(screen.getByRole('tab', { name: t.round.day(1) })))
    expect(selected()).toEqual([t.round.day(1)])
    expect(where()).toBe('/t/viaje/admin/grupos?ronda=r1 REPLACE')
  })

  it('leaving a day with a draft asks first; once confirmed, the address follows too (N9)', async () => {
    mount('?ronda=r2')
    await act(async () => fireEvent.click(screen.getByRole('button', { name: `+ ${t.admin.groups.addGroup}` })))
    await act(async () => fireEvent.click(screen.getByRole('tab', { name: t.round.day(3) })))
    expect(selected()).toEqual([t.round.day(2)])
    await act(async () => fireEvent.click(screen.getByRole('button', { name: t.common.confirm })))
    expect(selected()).toEqual([t.round.day(3)])
    expect(where()).toBe('/t/viaje/admin/grupos?ronda=r3 REPLACE')
  })

  it('a day that is not there, or was cancelled, falls back to the current day (M14)', () => {
    mount('?ronda=nope')
    expect(selected()).toEqual([t.round.day(1)])
    cleanup()
    mount('?ronda=r2', (s) => {
      s.rounds[1]!.status = 'cancelled'
    })
    expect(screen.queryByRole('tab', { name: t.round.day(2) })).toBeNull()
    expect(selected()).toEqual([t.round.day(1)])
  })

  it('the current day cancelled: Grupos opens on the first day left, not on none', () => {
    mount('', (s) => {
      s.rounds[0]!.status = 'cancelled'
    })
    expect(useTournament.getState().data!.snapshot.tournament.currentRoundId).toBe('r1')
    expect(selected()).toEqual([t.round.day(2)])
  })
})
