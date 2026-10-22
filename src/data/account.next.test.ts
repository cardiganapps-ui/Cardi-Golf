/** UX-25: `next` is followed after a sign-in only when it is a path of this app. */
import { describe, expect, it, vi } from 'vitest'

vi.mock('../lib/supabase', () => ({ supabase: () => ({}), supabaseConfigured: false, authSettings: async () => ({}) }))
const { safeNext } = await import('./account')

describe('safeNext', () => {
  it('keeps a path of the app, with its query', () => {
    expect(safeNext('/ronda')).toBe('/ronda')
    expect(safeNext('/t/nacho/mas')).toBe('/t/nacho/mas')
    expect(safeNext('/ronda?crew=abc')).toBe('/ronda?crew=abc')
  })
  it('refuses another site, however it is written', () => {
    for (const raw of [
      'https://evil.example',
      '//evil.example',
      '/\\evil.example',
      '/\\/evil.example',
      'javascript:alert(1)',
      'ronda',
      '',
      null,
    ])
      expect(safeNext(raw), String(raw)).toBe('/')
  })
  it('refuses a control character, which a browser drops before it reads the path', () => {
    expect(safeNext('/\t/evil.example')).toBe('/')
    expect(safeNext('/ronda\n')).toBe('/')
  })
})
