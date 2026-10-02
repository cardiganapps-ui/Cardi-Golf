// @vitest-environment happy-dom
/**
 * A legal page opened from a consent line is a tab of its own (the form,
 * half filled in, waits in the other one). There «Volver a Polo» loaded a
 * second copy of the app instead (PR #88 verifier, P3). From a consent link
 * (`?desde=formulario`) the page offers to close its tab; opened any other
 * way it keeps «Volver a Polo».
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { t } from '../i18n/es-MX'
import { LegalScreen } from './LegalScreen'

const L = t.legal

function mount(url: string) {
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/privacidad" element={<LegalScreen doc="privacy" />} />
        <Route path="/terminos" element={<LegalScreen doc="terms" />} />
        <Route path="/" element={<h1>Polo</h1>} />
      </Routes>
    </MemoryRouter>,
  )
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('opened from a consent link', () => {
  it('offers «Cerrar y volver», which closes the tab, and no link loads a second Polo', () => {
    const close = vi.spyOn(window, 'close').mockImplementation(() => undefined)
    mount('/privacidad?desde=formulario')
    expect(screen.queryByRole('link', { name: L.back })).toBeNull()
    expect([...document.querySelectorAll('a')].map((a) => a.getAttribute('href'))).not.toContain('/')
    fireEvent.click(screen.getByRole('button', { name: L.close }))
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('the other document keeps the marker, so it can close too', () => {
    mount('/privacidad?desde=formulario')
    fireEvent.click(screen.getByRole('link', { name: L.terms.title }))
    expect(screen.getByRole('heading', { level: 1, name: L.terms.title })).toBeTruthy()
    expect(screen.getByRole('button', { name: L.close })).toBeTruthy()
    expect(screen.getByRole('link', { name: L.privacy.title }).getAttribute('href')).toBe('/privacidad?desde=formulario')
  })

  it('a browser that keeps the tab open: says how to get back, and offers «Volver a Polo» (P3: opened on its own, it was a dead end)', () => {
    vi.useFakeTimers()
    vi.spyOn(window, 'close').mockImplementation(() => undefined)
    mount('/terminos?desde=formulario')
    fireEvent.click(screen.getByRole('button', { name: L.close }))
    expect(screen.queryByText(L.closeBlocked)).toBeNull()
    expect(screen.queryByRole('link', { name: L.back })).toBeNull()
    act(() => void vi.advanceTimersByTime(1000))
    expect(screen.getByRole('status').textContent).toBe(L.closeBlocked)
    // Typed or bookmarked with the marker, there is no form behind it: the way back is Polo itself, in this tab.
    const back = screen.getByRole('link', { name: L.back })
    expect(back.getAttribute('href')).toBe('/')
    fireEvent.click(back)
    expect(screen.getByRole('heading', { level: 1, name: 'Polo' })).toBeTruthy()
  })
})

describe('opened any other way (the home footer, Google\'s consent screen, a typed address)', () => {
  it('keeps «Volver a Polo»', () => {
    mount('/privacidad')
    // The brand and the button at the end, both home.
    const back = screen.getAllByRole('link', { name: L.back })
    expect(back.map((a) => a.getAttribute('href'))).toEqual(['/', '/'])
    expect(screen.queryByRole('button', { name: L.close })).toBeNull()
    expect(screen.getByRole('link', { name: L.terms.title }).getAttribute('href')).toBe('/terminos')
  })
})
