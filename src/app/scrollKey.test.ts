import { describe, expect, it } from 'vitest'
import { scrollKey } from './scrollKey'

describe('where a page keeps its scroll (MOT-16)', () => {
  it('a tournament screen by its path, whatever the history entry', () => {
    expect(scrollKey({ pathname: '/t/nacho/dinero', key: 'a1' })).toBe('/t/nacho/dinero')
    expect(scrollKey({ pathname: '/t/nacho/dinero', key: 'b2' })).toBe('/t/nacho/dinero')
    expect(scrollKey({ pathname: '/t/nacho/admin/jugadores', key: 'c3' })).toBe('/t/nacho/admin/jugadores')
    // En vivo is one screen with or without its slash.
    expect(scrollKey({ pathname: '/t/nacho/', key: 'd4' })).toBe('/t/nacho')
    expect(scrollKey({ pathname: '/t/_/full12-live/juegos', key: 'e5' })).toBe('/t/_/full12-live/juegos')
  })

  it('a link to watch by its path, with the token taken out', () => {
    const token = 'Zq3_x9Kp-2mWvR7tYb1nLs0a'
    expect(scrollKey({ pathname: `/v/${token}/dinero`, key: 'f6' })).toBe('/v/:token/dinero')
    expect(scrollKey({ pathname: `/v/${token}`, key: 'g7' })).toBe('/v/:token')
    expect(scrollKey({ pathname: `/v/${token}/`, key: 'g7' })).not.toContain(token)
  })

  it('every other page by its history entry, as a browser keeps it', () => {
    expect(scrollKey({ pathname: '/', key: 'h8' })).toBe('h8')
    expect(scrollKey({ pathname: '/p/diego', key: 'i9' })).toBe('i9')
    expect(scrollKey({ pathname: '/organizer/new', key: 'j0' })).toBe('j0')
    // Not a tournament: `/t` alone, or a path that only starts with the letters.
    expect(scrollKey({ pathname: '/t', key: 'k1' })).toBe('k1')
    expect(scrollKey({ pathname: '/terminos', key: 'l2' })).toBe('l2')
    expect(scrollKey({ pathname: '/ventas', key: 'm3' })).toBe('m3')
  })
})
