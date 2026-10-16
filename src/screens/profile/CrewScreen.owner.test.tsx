// @vitest-environment happy-dom
/**
 * TRUST-11: a crew's code let anyone in for good, with every member's full profile, and its owner could not take
 * anyone out. Now the owner takes a member out, approves who enters, and gives a new code an end (0071); a member
 * sees none of it.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { t } from '../../i18n/es-MX'
import type { CrewPage } from '../../data/crews'

const api = vi.hoisted(() => ({
  crewPage: vi.fn(),
  leaveCrew: vi.fn(async () => undefined),
  rotateCrewCode: vi.fn(async (_id: string, _days?: number | null) => 'NEW123'),
  removeCrewMember: vi.fn(async (_id: string, _handle: string) => undefined),
  respondCrewRequest: vi.fn(async (_id: string, _handle: string, _accept: boolean) => undefined),
  setCrewApproval: vi.fn(async (_id: string, _on: boolean) => undefined),
}))
vi.mock('../../data/crews', () => api)
const { CrewView } = await import('./CrewScreen')

const C = t.crews
const page = (role: 'owner' | 'member'): CrewPage => ({
  crew: { id: 'c1', slug: 'jueves', name: 'Los jueves', joinCode: 'JUEV3S', role, createdAt: '2026-01-01T00:00:00Z', approval: false, codeExpiresAt: null, codeExpired: false },
  members: [
    { handle: 'duena', displayName: 'Dueña', avatarUrl: null, index: 10, role: 'owner', joinedAt: '2026-01-01T00:00:00Z' },
    { handle: 'extrano', displayName: 'Extraño', avatarUrl: null, index: null, role: 'member', joinedAt: '2026-02-01T00:00:00Z' },
  ],
  requests: role === 'owner' ? [{ handle: 'pablo', displayName: 'Pablo', avatarUrl: null, at: '2026-03-01T00:00:00Z' }] : [],
  outings: [],
  results: [],
})
const onChanged = vi.fn()
beforeEach(() => {
  for (const f of Object.values(api)) f.mockClear()
  onChanged.mockClear()
})
afterEach(cleanup)
const mount = (role: 'owner' | 'member') =>
  render(
    <MemoryRouter>
      <CrewView page={page(role)} onChanged={onChanged} />
    </MemoryRouter>,
  )

describe('a crew\'s owner decides who is in it (TRUST-11)', () => {
  it('takes a member out, after saying what that does; never himself', async () => {
    mount('owner')
    expect(screen.queryByRole('button', { name: C.removeTitle('Dueña') })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: C.removeTitle('Extraño') }))
    expect(screen.getByText(C.removeBody('Extraño', 'Los jueves'))).toBeTruthy()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: C.remove })))
    expect(api.removeCrewMember).toHaveBeenCalledWith('c1', 'extrano')
    expect(onChanged).toHaveBeenCalled()
  })

  it('answers who waits, and turns approval on', async () => {
    mount('owner')
    expect(screen.getByText(C.requests(1))).toBeTruthy()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: C.accept })))
    expect(api.respondCrewRequest).toHaveBeenCalledWith('c1', 'pablo', true)
    await act(async () => fireEvent.click(screen.getByRole('checkbox', { name: C.approval })))
    expect(api.setCrewApproval).toHaveBeenCalledWith('c1', true)
  })

  it('gives a new code an end', async () => {
    mount('owner')
    fireEvent.click(screen.getByRole('button', { name: C.rotate }))
    fireEvent.click(screen.getByRole('radio', { name: C.rotateDays.d7 }))
    await act(async () => fireEvent.click(screen.getAllByRole('button', { name: C.rotate }).at(-1)!))
    expect(api.rotateCrewCode).toHaveBeenCalledWith('c1', 7)
  })

  it('a member sees none of it', () => {
    mount('member')
    expect(screen.queryByRole('button', { name: C.removeTitle('Extraño') })).toBeNull()
    expect(screen.queryByRole('checkbox', { name: C.approval })).toBeNull()
    expect(screen.queryByText(C.requests(1))).toBeNull()
  })
})
