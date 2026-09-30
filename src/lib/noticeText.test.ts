import { describe, expect, it } from 'vitest'
import { noticeLine } from './noticeText'

const actor = { handle: 'diego.ortiz', displayName: 'Diego Ortiz' }

describe('noticeLine (inbox and push share it)', () => {
  it('names who did it and links where it happened', () => {
    expect(noticeLine({ kind: 'friend_request', data: {}, actor })).toEqual({ text: 'Diego Ortiz te quiere agregar como amigo', to: '/amigos' })
    expect(noticeLine({ kind: 'rivalry_round', data: { rivalryId: 'r' }, actor }).to).toBe('/p/diego.ortiz/vs')
    expect(noticeLine({ kind: 'crew_join', data: { crew: 'Los del sábado', slug: 'los-del-sabado' }, actor })).toEqual({ text: 'Diego Ortiz entró a Los del sábado', to: '/c/los-del-sabado' })
  })
  it('reads a finish in lower case mid-sentence and never shows an amount', () => {
    const r = noticeLine({ kind: 'results', data: { tournament: 'Copa Otoño', slug: 'copa', rankLabel: 'T3', field: 16 }, actor: null })
    expect(r).toEqual({ text: 'Resultados de Copa Otoño: quedaste empatado en 3.º de 16', to: '/t/copa' })
    expect(r.text).not.toMatch(/\$/)
  })
  it('a notice from the Admin de Polo carries its own title for the push, and stays inside Polo', () => {
    const n = noticeLine({ kind: 'platform_notice', data: { title: 'Mantenimiento', body: 'Polo se actualiza a las 11.', url: '/crews' }, actor: null })
    expect(n).toEqual({ text: 'Mantenimiento: Polo se actualiza a las 11.', to: '/crews', title: 'Mantenimiento', body: 'Polo se actualiza a las 11.' })
    for (const url of ['https://evil.example', '//evil.example', 'javascript:alert(1)', '/ok<script>']) {
      expect(noticeLine({ kind: 'platform_notice', data: { title: 'x', body: 'y', url }, actor: null }).to).toBe('/avisos')
    }
  })
})
