// @vitest-environment happy-dom
/**
 * PERF-01: a rendition's <img> carries its size, so a slot sized by its height
 * (the TV, the ceremony) has its width before the file arrives. A logo stored
 * whole is shown as it is.
 */
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { TournamentLogo } from './TournamentLogo'

afterEach(cleanup)

const base = 'https://ref.supabase.co/storage/v1/object/public/tournament-assets/t1/'

describe('TournamentLogo', () => {
  it('a rendition gets its width and height', () => {
    const { container } = render(<TournamentLogo url={`${base}logo-222x240-17.webp?v=18`} className="x" />)
    const img = container.querySelector('img')!
    expect(img.getAttribute('src')).toBe(`${base}logo-222x240-17.webp?v=18`)
    expect(img.getAttribute('width')).toBe('222')
    expect(img.getAttribute('height')).toBe('240')
    expect(img.getAttribute('alt')).toBe('')
    // Its slot's class, and the plate it takes on the dark sheet (VIS-11).
    expect(img.className).toBe('tournament-logo x')
  })

  it('a logo stored whole has no size to give', () => {
    const { container } = render(<TournamentLogo url={`${base}logo.png`} />)
    const img = container.querySelector('img')!
    expect(img.getAttribute('src')).toBe(`${base}logo.png`)
    expect(img.hasAttribute('width')).toBe(false)
    expect(img.hasAttribute('height')).toBe(false)
  })

  it('the share card asks for a CORS read, so it can inline the file', () => {
    const { container } = render(<TournamentLogo url={`${base}logo-56x56-1.webp`} crossOrigin="anonymous" />)
    expect(container.querySelector('img')!.getAttribute('crossorigin')).toBe('anonymous')
  })
})
