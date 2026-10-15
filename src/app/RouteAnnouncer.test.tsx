// @vitest-environment happy-dom
/**
 * A11Y-13: every screen was titled «Polo», and changing page said nothing:
 * after a tap on «Juegos» a screen reader heard silence and focus sat on the
 * tab. Each page is titled from the copy file, and a new page is either said
 * (focus kept on a control that survived it) or focused at its h1 (focus
 * dropped with the old page), never both.
 */
import 'fake-indexeddb/auto'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Link, MemoryRouter, Outlet, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import { getFixture } from '../dev/fixtures'
import { dataFromSnapshot, useTournament } from '../data/tournamentStore'
import { t } from '../i18n/es-MX'
import { ANNOUNCE_DELAY_MS, RouteAnnouncer } from './RouteAnnouncer'
import { routeTitle, usePageTitle } from './pageTitle'

const fx = getFixture('full12-live')!
const NAME = fx.snapshot.tournament.name
const SLUG = fx.snapshot.tournament.slug

describe('every page has its own title (A11Y-13)', () => {
  it.each([
    [`/t/${SLUG}`, t.nav.live],
    [`/t/${SLUG}/tarjeta`, t.nav.card],
    [`/t/${SLUG}/juegos`, t.nav.games],
    [`/t/${SLUG}/dinero`, t.nav.money],
    [`/t/${SLUG}/stats`, t.stats.title],
    [`/t/${SLUG}/reglamento`, t.rules.title],
    [`/t/${SLUG}/mas`, t.more.title],
    [`/t/${SLUG}/tv`, t.tv.title],
    [`/t/${SLUG}/ceremonia`, t.ceremony.title],
    [`/t/${SLUG}/imprimir`, t.titles.print],
    [`/t/${SLUG}/admin/jugadores`, `${t.admin.title}: ${t.admin.sections.players}`],
    [`/t/_/full12-live/juegos`, t.nav.games],
    ['/admin/salud', `${t.platform.title}: ${t.platform.sections.health}`],
    ['/admin/_/torneos/abc', `${t.platform.title}: ${t.platform.sections.tournaments}`],
    ['/organizer', t.titles.myTournaments],
    ['/organizer/nuevo/_', t.titles.newTournament],
    ['/privacidad', t.legal.privacy.title],
    ['/p/diego', t.titles.profile],
    ['/p/diego/vs', t.titles.versus],
    ['/', t.titles.home],
  ])('%s is «%s»', (path, page) => {
    expect(routeTitle(path).page).toBe(page)
  })

  it('a tournament page carries the tournament’s slug, and only those', () => {
    expect(routeTitle(`/t/${SLUG}/tarjeta`).slug).toBe(SLUG)
    expect(routeTitle('/t/_/full12-live').slug).toBe('_/full12-live')
    expect(routeTitle('/organizer').slug).toBeNull()
  })
})

function Shell() {
  return (
    <>
      <nav aria-label="Secciones">
        <Link to={`/t/${SLUG}`}>Tab En vivo</Link>
        <Link to={`/t/${SLUG}/juegos`}>Tab Juegos</Link>
      </nav>
      <main>
        <Outlet />
      </main>
      <RouteAnnouncer />
    </>
  )
}
function Live() {
  return (
    <>
      <h1>{NAME}</h1>
      <Link to={`/t/${SLUG}/reglamento`}>Ver reglamento</Link>
    </>
  )
}
function Missing() {
  usePageTitle(t.titles.notFound)
  return <h1>{t.errors.notFound}</h1>
}

function mount(at: string) {
  useTournament.setState({ tournamentId: fx.snapshot.tournament.id, data: dataFromSnapshot(structuredClone(fx.snapshot)), loading: false })
  render(
    <MemoryRouter initialEntries={[at]}>
      <Routes>
        <Route element={<Shell />}>
          <Route path="/t/:slug" element={<Live />} />
          <Route path="/t/:slug/juegos" element={<h1>{t.nav.games}</h1>} />
          <Route path="/t/:slug/reglamento" element={<h1>{t.rules.title}</h1>} />
          <Route path="*" element={<Missing />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}
const region = () => document.querySelector('p[aria-live="polite"]')!
const wait = (ms: number) => act(() => new Promise((r) => setTimeout(r, ms)))

afterEach(() => {
  cleanup()
  useTournament.setState({ tournamentId: null, data: null })
})

describe('a new page is said, or focused, once (A11Y-13)', () => {
  it('the document title names the page and the tournament', async () => {
    mount(`/t/${SLUG}`)
    await wait(0)
    expect(document.title).toBe(`${t.nav.live}, ${NAME} — Polo`)
  })

  it('a tab of the bar keeps focus, and the new page is said in the polite region, which was there and empty before', async () => {
    mount(`/t/${SLUG}`)
    await wait(0)
    // Mounted from the start, saying nothing for the first page.
    expect(region().textContent).toBe('')
    const tab = screen.getByRole('link', { name: 'Tab Juegos' })
    tab.focus()
    fireEvent.click(tab)
    await wait(ANNOUNCE_DELAY_MS + 50)
    expect(document.title).toBe(`${t.nav.games}, ${NAME} — Polo`)
    expect(region().textContent).toBe(`${t.nav.games}, ${NAME}`)
    expect(document.activeElement).toBe(tab)
  })

  it('a link inside the page goes with it: focus lands on the new page’s h1, and nothing more is said', async () => {
    mount(`/t/${SLUG}`)
    await wait(0)
    const link = screen.getByRole('link', { name: 'Ver reglamento' })
    link.focus()
    fireEvent.click(link)
    await wait(ANNOUNCE_DELAY_MS + 50)
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1, name: t.rules.title }))
    expect(region().textContent).toBe('')
    expect(document.title).toBe(`${t.rules.title}, ${NAME} — Polo`)
  })

  it('a screen that names itself wins over its address', async () => {
    mount('/nada/aqui')
    await wait(0)
    expect(document.title).toBe(`${t.titles.notFound} — Polo`)
  })
})
