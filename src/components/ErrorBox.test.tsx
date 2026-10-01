// @vitest-environment happy-dom
/** COPY-04: ErrorBox takes the error itself and never prints its text. */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ApiError } from '../data/api'
import { t } from '../i18n/es-MX'
import { ErrorBox } from './ui'

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
})
