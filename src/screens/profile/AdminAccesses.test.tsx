// @vitest-environment happy-dom
/**
 * TRUST-22: a person never knew when the Admin de Polo opened his account or his crew. Editar perfil now lists each
 * time, with the reason (my_admin_accesses, 0068), never who; nothing at all on a database without 0068.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { t } from '../../i18n/es-MX'
import type { AdminAccess } from '../../data/adminAccess'

const answer = vi.hoisted(() => ({ rows: [] as AdminAccess[] | null }))
vi.mock('../../data/adminAccess', () => ({ myAdminAccesses: () => Promise.resolve(answer.rows) }))
const { AdminAccesses } = await import('./AdminAccesses')

const A = t.profile.adminAccess
afterEach(cleanup)
const row = (e: Partial<AdminAccess>, i: number): AdminAccess => ({ id: i, at: '2026-10-15T10:00:00Z', action: 'view', kind: 'person', reason: null, crew: null, ...e })

describe('«Accesos del administrador» (TRUST-22)', () => {
  it('each access with its reason: his account, his crew, a crew since gone', async () => {
    answer.rows = [
      row({ reason: 'Pidió ayuda con su PIN' }, 1),
      row({ kind: 'crew', crew: 'Los jueves', reason: 'Reportaron a un intruso' }, 2),
      row({ kind: 'crew', crew: null, action: 'crew_remove_member', reason: 'Spam' }, 3),
    ]
    render(<AdminAccesses />)
    expect(await screen.findByText(A.line.view!)).toBeTruthy()
    expect(screen.getByText(new RegExp(A.reason('Pidió ayuda con su PIN')))).toBeTruthy()
    expect(screen.getByText(A.crewLine.view!('Los jueves'))).toBeTruthy()
    expect(screen.getByText(A.crewLine.crew_remove_member!(A.goneCrew))).toBeTruthy()
  })

  it('three at first, the rest a tap away', async () => {
    answer.rows = Array.from({ length: 5 }, (_, i) => row({ reason: `Motivo ${i}` }, i))
    render(<AdminAccesses />)
    expect(await screen.findAllByText(A.line.view!)).toHaveLength(3)
    fireEvent.click(screen.getByRole('button', { name: A.more }))
    expect(screen.getAllByText(A.line.view!)).toHaveLength(5)
  })

  it('none yet says so; a database without 0068 shows nothing', async () => {
    answer.rows = []
    const { unmount } = render(<AdminAccesses />)
    expect(await screen.findByText(A.none)).toBeTruthy()
    unmount()
    answer.rows = null
    const { container } = render(<AdminAccesses />)
    await new Promise((r) => setTimeout(r, 0))
    expect(container.textContent).toBe('')
  })
})
