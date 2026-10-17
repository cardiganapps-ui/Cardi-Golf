// @vitest-environment happy-dom
/**
 * STRAT-14: the catalog's verified cards (0075). A card a person compared with the club's printed one carries
 * «Tarjeta verificada» in the course list, in a search's «Ya en Polo» (the catalog's own matches, listed before the
 * providers' so a course someone loaded is used, not imported again) and in the editor, which says a change takes
 * the mark off. Inside a Terminado tournament the Comité may verify a card its days played; the server holds the
 * rule (supabase/tests/course_catalog.sql), so the screen only offers it where it can hold.
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CatalogCourse } from '../../data/api'

const server = vi.hoisted(() => ({
  courses: [] as CatalogCourse[],
  verify: vi.fn(async (_course: string, _tournament: string, _reason: string) => undefined),
  search: vi.fn(async (_q: string) => [] as unknown[]),
}))
vi.mock('../../data/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../data/api')>()),
  listCourses: vi.fn(async () => server.courses),
  verifyCourse: server.verify,
  loadCourseDraft: vi.fn(async (id: string) => ({
    id,
    name: server.courses.find((c) => c.id === id)!.name,
    verifiedAt: server.courses.find((c) => c.id === id)!.verifiedAt,
    tees: [],
  })),
}))
vi.mock('../../lib/courseApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/courseApi')>()),
  searchCourses: server.search,
}))

import { dataFromSnapshot, useTournament } from '../../data/tournamentStore'
import { getFixture } from '../../dev/fixtures'
import { t } from '../../i18n/es-MX'
import { TournamentContext } from '../tournament/tournamentContext'
import { AdminCourses } from './AdminCourses'
import { CourseEditor } from './CourseEditor'

const C = t.admin.courses
const course = (
  id: string,
  name: string,
  verifiedAt: string | null,
  location: string | null = 'Cabo San Lucas',
): CatalogCourse => ({
  id,
  name,
  location,
  source: 'golfcourseapi',
  tees: 2,
  attribution: null,
  createdBy: null,
  verifiedAt,
})

beforeEach(() => {
  server.courses = [
    course('course1', 'Solmar Golf Links', null),
    course('c-quivira', 'Quivira Golf Club', '2026-10-01T12:00:00Z'),
    course('c-otro', 'Club de Golf México', null, 'CDMX'),
  ]
  server.verify.mockClear()
  server.search.mockClear()
})
afterEach(cleanup)

/** Comité › Campos of the fixture tournament (its days play `course1`), in the status given. */
async function inTournament(status: 'live' | 'finished', opts: { quick?: boolean; practice?: boolean } = {}) {
  const fx = getFixture('full12-live')!
  const snap = structuredClone(fx.snapshot)
  snap.tournament = { ...snap.tournament, status, quick: !!opts.quick, countsForStats: !opts.practice }
  useTournament.setState({
    tournamentId: snap.tournament.id,
    data: dataFromSnapshot(snap),
    loading: false,
    error: null,
  })
  await act(async () => {
    render(
      <MemoryRouter>
        <TournamentContext.Provider
          value={{
            tournamentId: snap.tournament.id,
            slug: '_/full12-live',
            lookup: fx.lookup,
            me: fx.me,
            refresh: async () => undefined,
            leave: async () => undefined,
          }}
        >
          <AdminCourses />
        </TournamentContext.Provider>
      </MemoryRouter>,
    )
  })
  return snap.tournament.id
}
const rowOf = (name: string) => screen.getByText(name).closest('div')!

describe('«Tarjeta verificada» (STRAT-14)', () => {
  it('marks the verified card in the catalog, and only it', async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <AdminCourses />
        </MemoryRouter>,
      )
    })
    expect(within(rowOf('Quivira Golf Club')).getByText('Tarjeta verificada')).toBeTruthy()
    expect(within(rowOf('Solmar Golf Links')).queryByText('Tarjeta verificada')).toBeNull()
    expect(screen.getAllByText('Tarjeta verificada')).toHaveLength(1)
  })

  it('lists the catalog’s own matches first in a search, with their badge, before the providers’', async () => {
    server.search.mockResolvedValueOnce([
      {
        provider: 'opengolfapi',
        externalId: 'q',
        name: 'Quivira Los Cabos',
        clubName: null,
        location: null,
        latitude: null,
        longitude: null,
        hasCard: null,
      },
    ])
    await act(async () => {
      render(
        <MemoryRouter>
          <AdminCourses />
        </MemoryRouter>,
      )
    })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: C.search })))
    const dialog = screen.getByRole('dialog')
    await act(async () =>
      fireEvent.change(within(dialog).getByPlaceholderText(C.searchPlaceholder), { target: { value: 'quivira cabo' } }),
    )
    await act(async () => fireEvent.click(within(dialog).getByRole('button', { name: t.common.search })))
    const known = within(dialog).getByRole('region', { name: C.inPolo })
    const match = within(known).getByRole('button', { name: /Quivira Golf Club/ })
    expect(within(match).getByText('Tarjeta verificada')).toBeTruthy()
    expect(within(known).queryByText('Solmar Golf Links')).toBeNull()
    const provider = within(dialog).getByRole('button', { name: /Quivira Los Cabos/ })
    expect(match.compareDocumentPosition(provider) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(within(dialog).getByText(C.providers)).toBeTruthy()
  })

  it('says in the editor that the card is verified and that a change takes the mark off', () => {
    render(
      <CourseEditor
        draft={{
          name: 'Quivira',
          verifiedAt: '2026-10-01T12:00:00Z',
          tees: [{ name: 'Negras', color: null, rating: 74.1, slope: 142, holes: [] }],
        }}
        notes={[]}
        busy={false}
        onSave={() => undefined}
        onCancel={() => undefined}
      />,
    )
    expect(screen.getByText('Tarjeta verificada')).toBeTruthy()
    expect(screen.getByText(C.verifiedHint)).toBeTruthy()
    cleanup()
    render(
      <CourseEditor
        draft={{ name: 'Solmar', tees: [{ name: 'Azules', color: null, rating: 72, slope: 130, holes: [] }] }}
        notes={[]}
        busy={false}
        onSave={() => undefined}
        onCancel={() => undefined}
      />,
    )
    expect(screen.queryByText('Tarjeta verificada')).toBeNull()
  })
})

describe('the Comité verifies a card its tournament played (STRAT-14)', () => {
  it('offers it once the tournament is Terminado, on the course its days played, unverified, and sends the reason', async () => {
    const tid = await inTournament('finished')
    expect(within(rowOf('Quivira Golf Club')).queryByRole('button', { name: C.verify })).toBeNull()
    expect(within(rowOf('Club de Golf México')).queryByRole('button', { name: C.verify })).toBeNull()
    await act(async () => fireEvent.click(within(rowOf('Solmar Golf Links')).getByRole('button', { name: C.verify })))
    const sheet = screen.getByRole('dialog', { name: C.verifyTitle })
    expect(within(sheet).getByText(C.verifyBody('Solmar Golf Links'))).toBeTruthy()
    await act(async () =>
      fireEvent.change(within(sheet).getByRole('textbox'), { target: { value: 'Comparada con la impresa del club' } }),
    )
    await act(async () => fireEvent.click(within(sheet).getByRole('button', { name: C.verify })))
    expect(server.verify).toHaveBeenCalledWith('course1', tid, 'Comparada con la impresa del club')
  })

  it('offers nothing while the tournament is under way, in an Ensayo or a Ronda rápida, or outside a tournament', async () => {
    for (const run of [
      () => inTournament('live'),
      () => inTournament('finished', { practice: true }),
      () => inTournament('finished', { quick: true }),
    ]) {
      await run()
      expect(screen.queryByRole('button', { name: C.verify })).toBeNull()
      cleanup()
    }
    useTournament.setState({ data: null })
    await act(async () => {
      render(
        <MemoryRouter>
          <AdminCourses />
        </MemoryRouter>,
      )
    })
    expect(screen.queryByRole('button', { name: C.verify })).toBeNull()
  })
})
