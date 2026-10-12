// @vitest-environment happy-dom
/**
 * After the notice or the terms change, someone who accepted an older
 * version sees it once (TRUST-05), never over the Tarjeta or a room screen.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import type { User } from '@supabase/supabase-js'

const rpc = vi.fn()
const getSession = vi.fn()
vi.mock('../lib/supabase', () => ({ supabaseConfigured: true, supabase: () => ({ rpc, auth: { getSession } }), authSettings: async () => null }))

const { LegalUpdate } = await import('./LegalUpdate')
const { QUIET_ROUTE, resetLegalUpdateForTests } = await import('./legalUpdateState')
const { useAuth } = await import('../data/auth')
const { currentVersions } = await import('../data/legal')
const { t } = await import('../i18n/es-MX')

const cur = currentVersions()
const mine = (privacy: string | null, terms: string | null) => ({
  data: { privacy: privacy && { version: privacy, acceptedAt: 'x' }, terms: terms && { version: terms, acceptedAt: 'x' } },
  error: null,
})

async function show(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <LegalUpdate />
    </MemoryRouter>,
  )
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0))
  })
}

beforeEach(() => {
  localStorage.clear()
  resetLegalUpdateForTests()
  rpc.mockReset()
  useAuth.setState({ user: { id: 'u1' } as User })
  getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } })
})
afterEach(cleanup)

describe('LegalUpdate', () => {
  it('names the changed notice, links to it, and «Entendido» records the new version', async () => {
    rpc.mockImplementation(async (name: string) => (name === 'my_legal_acceptances' ? mine('2026-10-01', cur.terms) : mine(cur.privacy, cur.terms)))
    await show('/t/torneo')
    expect(screen.getByRole('dialog', { name: t.legal.update.title(true, false) })).toBeTruthy()
    expect(screen.getByRole('link', { name: new RegExp(t.legal.privacy.title) }).getAttribute('href')).toBe('/privacidad?desde=formulario')
    expect(screen.queryByRole('link', { name: new RegExp(t.legal.terms.title) })).toBeNull()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: t.legal.update.ok }))
    })
    expect(rpc).toHaveBeenCalledWith('accept_legal', { p_privacy: cur.privacy, p_terms: cur.terms, p_context: 'update' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('«Cerrar» leaves it for the next time the app opens, and records nothing', async () => {
    rpc.mockResolvedValue(mine('2026-10-01', '2000-01-01'))
    await show('/')
    expect(screen.getByRole('dialog', { name: t.legal.update.title(true, true) })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: t.common.close }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(rpc.mock.calls.some((c) => c[0] === 'accept_legal')).toBe(false)
    cleanup()
    await show('/')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('says nothing to someone who never accepted, nor to someone up to date', async () => {
    rpc.mockResolvedValue(mine(null, null))
    await show('/')
    expect(screen.queryByRole('dialog')).toBeNull()
    cleanup()
    resetLegalUpdateForTests()
    rpc.mockResolvedValue(mine(cur.privacy, cur.terms))
    await show('/')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('never over the Tarjeta, a room screen, the documents or the fixtures', async () => {
    for (const p of ['/t/torneo/tarjeta', '/t/torneo/tv', '/t/torneo/ceremonia', '/t/torneo/imprimir', '/privacidad', '/terminos', '/t/_/full12-live', '/admin/_/salud'])
      expect(QUIET_ROUTE.test(p), p).toBe(true)
    for (const p of ['/', '/t/torneo', '/t/torneo/dinero', '/organizer', '/admin']) expect(QUIET_ROUTE.test(p), p).toBe(false)
    rpc.mockResolvedValue(mine('2026-10-01', cur.terms))
    await show('/t/torneo/tarjeta')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(rpc.mock.calls.some((c) => c[0] === 'my_legal_acceptances')).toBe(false)
  })
})
