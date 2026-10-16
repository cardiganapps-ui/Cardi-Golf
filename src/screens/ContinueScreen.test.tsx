// @vitest-environment happy-dom
/** PWA-14: the installed app's shortcuts land on `/continuar` and `/continuar/tarjeta`, and go on from there. */
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setLastTournament } from '../data/session'
import { ContinueScreen } from './ContinueScreen'

function open(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<p>Inicio</p>} />
        <Route path="/continuar" element={<ContinueScreen />} />
        <Route path="/continuar/tarjeta" element={<ContinueScreen tab="tarjeta" />} />
        <Route path="/t/:slug" element={<p>En vivo del torneo</p>} />
        <Route path="/t/:slug/tarjeta" element={<p>Tarjeta del torneo</p>} />
        <Route path="/tv" element={<ContinueScreen tab="tv" />} />
        <Route path="/t/:slug/tv" element={<p>TV del torneo</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})
afterEach(cleanup)

describe('the shortcuts’ page (PWA-14)', () => {
  it('«Mi tarjeta» opens the last tournament’s Tarjeta, «En vivo» its page', async () => {
    setLastTournament({ slug: 'nachos-bachelor', name: 'Nacho', at: Date.now() })
    open('/continuar/tarjeta')
    expect(await screen.findByText('Tarjeta del torneo')).toBeTruthy()
    cleanup()
    open('/continuar')
    expect(await screen.findByText('En vivo del torneo')).toBeTruthy()
  })

  it('with no tournament on the phone, Home', async () => {
    open('/continuar/tarjeta')
    expect(await screen.findByText('Inicio')).toBeTruthy()
  })

  // ARCH-19: `/tv` said «Modo TV» was coming (a placeholder) while every tournament has its own TV.
  it('`/tv` opens the last tournament’s TV, Home with none', async () => {
    open('/tv')
    expect(await screen.findByText('Inicio')).toBeTruthy()
    cleanup()
    setLastTournament({ slug: 'nachos-bachelor', name: 'Nacho', at: Date.now() })
    open('/tv')
    expect(await screen.findByText('TV del torneo')).toBeTruthy()
  })
})
