/**
 * UX-23: under a marker's rule a card to sign is a teammate's (0054 sends
 * `marker: true`), and the notice says so without a name; the pairs' notice
 * reads as it did.
 */
import { describe, expect, it } from 'vitest'
import { noticeLine } from './noticeText'

const at = { tournament: 'Sábado con firma', slug: 'sabado' }

describe('a card to sign, by the tournament’s rule', () => {
  it('a marker’s: a teammate’s cards, the same page and title', () => {
    expect(
      noticeLine({ kind: 'card_to_sign', data: { ...at, round: 1, group: 2, marker: true }, actor: null }),
    ).toEqual({
      text: 'Firma la tarjeta del día 1 en Sábado con firma',
      to: '/t/sabado/tarjeta?vista=tarjeta',
      title: 'Sábado con firma',
      body: 'Ya hay tarjetas de tu grupo del día 1 listas: firma las de tus compañeros.',
    })
  })
  it('without the flag, the other pair’s, as before', () => {
    expect(noticeLine({ kind: 'card_to_sign', data: { ...at, round: 1, group: 2 }, actor: null }).body).toBe(
      'Tu grupo terminó el día 1: firma la tarjeta de la otra pareja.',
    )
  })
})
