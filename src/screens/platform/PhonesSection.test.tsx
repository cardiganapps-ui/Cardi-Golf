// @vitest-environment happy-dom
/**
 * Salud's «Teléfonos» (STRAT-02): what the phones reported, said plainly.
 * Hoyos en vivo is green only with a p95 of 2 s or less, and says how many
 * were slower; holes a phone still has to send and errors read as problems.
 */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { Telemetry } from '../../data/platform'
import { duration } from '../../lib/duration'
import { PhonesSection } from './PhonesSection'

afterEach(cleanup)

const base: Telemetry = {
  since: '2026-10-11T05:00:00Z',
  events: 0,
  errors: [],
  sync: [],
  syncByTournament: [],
  vitals: [],
  funnel: [],
  devices: { seen: 0, withPending: 0, pending: 0, rejected: 0, oldestPendingAt: null, builds: [] },
}

describe('Salud › Teléfonos', () => {
  it('formats a time as a person reads it', () => {
    expect(duration(740)).toBe('740 ms')
    expect(duration(1630)).toBe('1.6 s')
    expect(duration(2000)).toBe('2 s')
  })

  it('an empty window says so, card by card', () => {
    render(<PhonesSection tel={base} />)
    expect(screen.getByText('Ningún hoyo de otro teléfono llegó en estas horas.')).toBeTruthy()
    expect(screen.getByText('Nada sin mandar')).toBeTruthy()
    expect(screen.getByText('Sin mediciones todavía.')).toBeTruthy()
    expect(screen.getByText('Ningún error en estas horas.')).toBeTruthy()
  })

  it('the numbers: the hole times, the slow ones, the phones behind, and each error with where and how often', () => {
    render(
      <PhonesSection
        tel={{
          ...base,
          events: 500,
          sync: [
            { name: 'apply_lag', count: 400, p50: 740, p95: 2_300, over2s: 30 },
            { name: 'save_ack', count: 100, p50: 310, p95: 980, over2s: 0 },
          ],
          vitals: [
            { name: 'lcp', count: 10, p75: 2_100 },
            { name: 'cls', count: 10, p75: 0.04 },
          ],
          errors: [
            {
              name: 'window.error',
              summary: 'TypeError: Load failed',
              route: '/t/:slug/tarjeta',
              build: 1,
              buildSha: 'abc1234',
              count: 7,
              devices: 3,
              first_at: '2026-10-11T06:00:00Z',
              last_at: '2026-10-11T06:00:00Z',
            },
          ],
          funnel: [{ name: 'hole_saved', count: 1_200, people: 6 }],
          devices: {
            seen: 14,
            withPending: 2,
            pending: 5,
            rejected: 1,
            oldestPendingAt: null,
            builds: [
              { build: 1, buildSha: 'abc1234', count: 12 },
              { build: null, buildSha: null, count: 2 },
            ],
          },
        }}
      />,
    )
    expect(screen.getByText('Llegan a los demás en 740 ms (la mitad), 2.3 s (95 de cada 100)')).toBeTruthy()
    expect(screen.getByText('30 de 400 tardaron más de 2 s')).toBeTruthy()
    expect(screen.getByText('El servidor contesta un hoyo en 310 ms (la mitad), 980 ms (95 de cada 100)')).toBeTruthy()
    expect(screen.getByText('14 teléfonos activos')).toBeTruthy()
    expect(screen.getByText('5 hoyos sin mandar en 2 teléfonos')).toBeTruthy()
    expect(screen.getByText('1 hoyo rechazado en los teléfonos')).toBeTruthy()
    expect(screen.getByText('Versión abc1234: 12')).toBeTruthy()
    expect(screen.getByText('Versión sin nombre: 2')).toBeTruthy()
    expect(screen.getByText('Carga: 2.1 s')).toBeTruthy()
    expect(screen.getByText('Saltos de la pantalla: 0.04')).toBeTruthy()
    expect(screen.getByText('TypeError: Load failed')).toBeTruthy()
    expect(
      screen.getByText(/^En \/t\/:slug\/tarjeta, 7 veces en 3 teléfonos, la última .+, versión abc1234$/),
    ).toBeTruthy()
    expect(screen.getByText('Hoyos guardados: 1,200 (6 personas)')).toBeTruthy()
  })
})
