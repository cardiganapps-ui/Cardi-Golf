// @vitest-environment happy-dom
/**
 * Resumen's north star and the organizer's funnel (STRAT-12): the number
 * docs/strategy/README.md says rules comes first, and each step reads as words
 * (tournaments and organizers), its bar measured against the tournaments
 * created. With nothing created there are no bars, only a sentence.
 */
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { PlatformFunnel } from '../../data/platform'
import { Funnel } from './OverviewScreen'

afterEach(cleanup)

const funnel: PlatformFunnel = {
  days: 90,
  northStar: 1,
  finished: 2,
  organizers: 3,
  steps: [
    { key: 'created', tournaments: 4, organizers: 3 },
    { key: 'field', tournaments: 4, organizers: 3 },
    { key: 'played', tournaments: 2, organizers: 2 },
    { key: 'scored', tournaments: 2, organizers: 2 },
    { key: 'signed', tournaments: 1, organizers: 1 },
    { key: 'finished', tournaments: 1, organizers: 1 },
  ],
}

describe('Funnel', () => {
  it('leads with tournaments closed to the peso', () => {
    render(<Funnel f={funnel} />)
    expect(screen.getByText('Torneos cerrados al peso')).toBeTruthy()
    expect(screen.getByText('2 terminados en total')).toBeTruthy()
    expect(screen.getByText(/En 90 días: terminados, con 8 o más jugadores/)).toBeTruthy()
  })

  it('says each step in words, in order, with its bar against the tournaments created', () => {
    const { container } = render(<Funnel f={funnel} />)
    const steps = within(screen.getByRole('list')).getAllByRole('listitem')
    expect(steps.map((li) => li.textContent)).toEqual([
      'Creados4 torneos, 3 organizadores',
      'Con jugadores4 torneos, 3 organizadores',
      'Con un día en juego2 torneos, 2 organizadores',
      'Con hoyos capturados2 torneos, 2 organizadores',
      'Con una tarjeta firmada1 torneo, 1 organizador',
      'Terminados1 torneo, 1 organizador',
    ])
    const widths = [...container.querySelectorAll('li [aria-hidden] > span')].map((b) => (b as HTMLElement).style.width)
    expect(widths).toEqual(['100%', '100%', '50%', '50%', '25%', '25%'])
  })

  it('draws no bars when nobody created a tournament', () => {
    render(<Funnel f={{ ...funnel, northStar: 0, finished: 0, organizers: 0, steps: funnel.steps.map((x) => ({ ...x, tournaments: 0, organizers: 0 })) }} />)
    expect(screen.queryByRole('list')).toBeNull()
    expect(screen.getByText('Ningún organizador ha creado un torneo en este periodo.')).toBeTruthy()
  })

  it('says how the courses arrived: in the catalog already or added, by path, for first tournaments and for all (STRAT-14)', () => {
    render(
      <Funnel
        f={{
          ...funnel,
          courses: {
            first: { tournaments: 3, withCourse: 3, found: { search: 1, photo: 0, manual: 0 }, added: { search: 1, photo: 2, manual: 0 } },
            all: { tournaments: 4, withCourse: 4, found: { search: 3, photo: 1, manual: 1 }, added: { search: 0, photo: 0, manual: 0 } },
          },
        }}
      />,
    )
    const items = within(screen.getByRole('list', { name: 'Cómo llegó cada campo' })).getAllByRole('listitem')
    expect(items.map((li) => li.textContent)).toEqual([
      'En su primer torneo1 de 4 ya estaba en Polo (1 de la búsqueda). 3 se agregaron (1 de la búsqueda y 2 de una foto).',
      'En todos5 de 5 ya estaban en Polo (3 de la búsqueda, 1 de una foto y 1 a mano).',
    ])
  })

  it('says nothing of courses on a database without them, and says so when no tournament has one', () => {
    const { unmount } = render(<Funnel f={funnel} />)
    expect(screen.queryByText('Cómo llegó cada campo')).toBeNull()
    unmount()
    const none = { tournaments: 2, withCourse: 0, found: { search: 0, photo: 0, manual: 0 }, added: { search: 0, photo: 0, manual: 0 } }
    render(<Funnel f={{ ...funnel, courses: { first: none, all: none } }} />)
    expect(screen.getAllByText('Ningún torneo tiene campo todavía.')).toHaveLength(2)
  })
})
