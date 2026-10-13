// @vitest-environment happy-dom
/**
 * PWA-09 at `/`, where the installed app opens. The field took six letters and digits, so a pasted link read
 * «HTTPS» and «Entrar» stayed off; and every launch of the installed app stopped here, a tap from the
 * tournament (on an iPhone, with nothing of Safari's: no tournament at all).
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useParams } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../data/auth', () => ({
  useAuth: () => ({ ready: true, user: null, isAnonymous: false, bootError: null }),
  hasStoredSession: () => false,
  retryAuth: vi.fn(async () => undefined),
}))
vi.mock('../lib/supabase', () => ({ supabaseConfigured: true, supabase: () => ({}) }))
vi.mock('../data/snapshotCache', async (importOriginal) => ({ ...(await importOriginal<typeof import('../data/snapshotCache')>()), hasCached: async () => false }))
vi.mock('./profile/MiPolo', () => ({ MiPolo: () => <p>Mi Polo</p> }))

import { setLastTournament } from '../data/session'
import { t } from '../i18n/es-MX'
import { HomeScreen } from './HomeScreen'

function Tournament() {
  return <p>Torneo {useParams().slug}</p>
}
function open(at = '/') {
  return render(
    <MemoryRouter initialEntries={[at]}>
      <Routes>
        <Route path="/" element={<HomeScreen />} />
        <Route path="/t/:slug" element={<Tournament />} />
      </Routes>
    </MemoryRouter>,
  )
}
function standalone(on: boolean) {
  window.matchMedia = ((q: string) => ({ matches: on && q === '(display-mode: standalone)', media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia
}
const field = () => screen.getByLabelText(t.home.joinPlaceholder)
const enter = () => screen.getByRole('button', { name: t.home.joinButton })

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  standalone(false)
})
afterEach(() => cleanup())

describe('joining from Home (PWA-09)', () => {
  it('a pasted link goes to its tournament', () => {
    open()
    fireEvent.change(field(), { target: { value: 'https://golf.cardigan.mx/t/nachos-bachelor' } })
    expect(field()).toHaveProperty('value', 'https://golf.cardigan.mx/t/nachos-bachelor')
    expect(enter()).toHaveProperty('disabled', false)
    fireEvent.click(enter())
    expect(screen.getByText('Torneo nachos-bachelor')).toBeTruthy()
  })

  it('so does the whole invitation, and a code typed in lower case', () => {
    open()
    fireEvent.change(field(), { target: { value: 'Nacho’s Bachelor: entra con el código NACHO1' } })
    fireEvent.click(enter())
    expect(screen.getByText('Torneo NACHO1')).toBeTruthy()
    cleanup()
    open()
    fireEvent.change(field(), { target: { value: 'nacho1' } })
    fireEvent.click(enter())
    expect(screen.getByText('Torneo nacho1')).toBeTruthy()
  })

  it('anything that names no tournament keeps «Entrar» off', () => {
    open()
    fireEvent.change(field(), { target: { value: 'hola' } })
    expect(enter()).toHaveProperty('disabled', false)
    fireEvent.change(field(), { target: { value: 'hola amigos' } })
    expect(enter()).toHaveProperty('disabled', true)
    fireEvent.change(field(), { target: { value: 'https://golf.cardigan.mx/' } })
    expect(enter()).toHaveProperty('disabled', true)
  })
})

describe('the installed app’s launch (PWA-09)', () => {
  it('goes straight back to the tournament it was in', () => {
    standalone(true)
    setLastTournament({ slug: 'nachos-bachelor', name: 'Nacho', at: Date.now() })
    open()
    expect(screen.getByText('Torneo nachos-bachelor')).toBeTruthy()
  })

  it('the first launch of an app installed from a tournament’s page opens that tournament', () => {
    standalone(true)
    open('/?t=nachos-bachelor')
    expect(screen.getByText('Torneo nachos-bachelor')).toBeTruthy()
  })

  it('in a browser, Home stays Home', () => {
    setLastTournament({ slug: 'nachos-bachelor', name: 'Nacho', at: Date.now() })
    open('/?t=nachos-bachelor')
    expect(screen.getByRole('heading', { name: t.home.joinTitle })).toBeTruthy()
  })
})
