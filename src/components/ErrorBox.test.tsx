// @vitest-environment happy-dom
/**
 * COPY-04: ErrorBox takes the error itself and never prints its text. VIS-13: it is the one error pattern (its
 * mark, a sentence, what still works, «Reintentar»), and a loading screen is drawn in the screen's own shapes.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../data/api'
import { t } from '../i18n/es-MX'
import { ErrorBox, Spinner } from './ui'

afterEach(cleanup)

describe('ErrorBox', () => {
  it('a raw fetch failure becomes the no-signal line', () => {
    render(<ErrorBox error={new TypeError('Failed to fetch')} />)
    expect(screen.getByRole('alert').textContent).toContain(t.errors.network)
    expect(screen.queryByText(/Failed to fetch/)).toBeNull()
  })

  it('an RLS refusal becomes the permission line', () => {
    render(<ErrorBox error={new ApiError('new row violates row-level security policy for table "scores"', '42501')} />)
    expect(screen.getByRole('alert').textContent).toContain(t.errors.permission)
    expect(screen.queryByText(/row-level security/)).toBeNull()
  })

  it('copy already made (a store error, a line from t) shows as is', () => {
    render(<ErrorBox error={t.errors.offlineFirstOpen} />)
    expect(screen.getByText(t.errors.offlineFirstOpen)).toBeTruthy()
  })

  it('carries its mark, a title, what still works and a retry (VIS-13)', () => {
    const retry = vi.fn()
    render(<ErrorBox error={new TypeError('Failed to fetch')} onRetry={retry} fallback={<a href="/">{t.errors.backHome}</a>} />)
    const box = screen.getByRole('alert')
    expect(box.querySelector('svg')).toBeTruthy()
    expect(box.querySelector('strong')!.textContent).toBe(t.common.error)
    expect(screen.getByRole('link', { name: t.errors.backHome })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: t.common.retry }))
    expect(retry).toHaveBeenCalledOnce()
    expect(box.className).not.toMatch(/card/)
  })
})

describe('loading screens (VIS-13)', () => {
  it.each([
    ['list', 6, 0],
    ['board', 6, 1],
    ['card', 4, 1],
  ] as const)('a %s skeleton draws its rows in the screen\'s shapes', (kind, rows, heads) => {
    const { container } = render(<Spinner kind={kind} />)
    expect(screen.getByRole('status', { name: t.common.loading })).toBeTruthy()
    expect(container.querySelectorAll('[class*="skRow"]')).toHaveLength(rows)
    expect(container.querySelectorAll('[class*="skBoardHead"], [class*="skHole"]')).toHaveLength(heads)
  })
})
