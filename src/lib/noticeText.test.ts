import { describe, expect, it } from 'vitest'
import { t } from '../i18n/es-MX'
import { noticeLine } from './noticeText'

const actor = { handle: 'diego.ortiz', displayName: 'Diego Ortiz' }

describe('noticeLine (inbox and push share it)', () => {
  it('names who did it and links where it happened', () => {
    expect(noticeLine({ kind: 'friend_request', data: {}, actor })).toEqual({ text: 'Diego Ortiz te quiere agregar como amigo', to: '/amigos' })
    expect(noticeLine({ kind: 'rivalry_round', data: { rivalryId: 'r' }, actor }).to).toBe('/p/diego.ortiz/vs')
    expect(noticeLine({ kind: 'crew_join', data: { crew: 'Los del sábado', slug: 'los-del-sabado' }, actor })).toEqual({ text: 'Diego Ortiz entró a Los del sábado', to: '/c/los-del-sabado' })
    // A crew that approves who enters (0071, TRUST-11).
    expect(noticeLine({ kind: 'crew_request', data: { crew: 'Los del sábado', slug: 'los-del-sabado' }, actor })).toEqual({ text: 'Diego Ortiz quiere entrar a Los del sábado', to: '/c/los-del-sabado' })
    expect(noticeLine({ kind: 'crew_accepted', data: { crew: 'Los del sábado', slug: 'los-del-sabado' }, actor })).toEqual({ text: 'Ya eres de Los del sábado', to: '/c/los-del-sabado' })
  })
  it('reads a finish in lower case mid-sentence and never shows an amount', () => {
    const r = noticeLine({ kind: 'results', data: { tournament: 'Copa Otoño', slug: 'copa', rankLabel: 'T3', field: 16 }, actor: null })
    expect(r).toEqual({ text: 'Resultados de Copa Otoño: quedaste empatado en 3.º de 16', to: '/t/copa' })
    expect(r.text).not.toMatch(/\$/)
  })
  it('a tournament’s notices (PWA-10): the tournament above, what happened below, its Tarjeta when tapped', () => {
    const at = { tournament: 'Nacho’s Bachelor', slug: 'nachos-bachelor' }
    expect(noticeLine({ kind: 'round_live', data: { ...at, round: 1, group: 2, startHole: 10, teeTime: '09:00' }, actor: null })).toEqual({
      text: 'Empezó el día 1 de Nacho’s Bachelor',
      to: '/t/nachos-bachelor/tarjeta',
      title: 'Nacho’s Bachelor',
      body: 'Empezó el día 1. Tu grupo 2 sale del hoyo 10 a las 9:00.',
    })
    // A day with no groups yet, or a group with no tee time: only what is known.
    expect(noticeLine({ kind: 'round_live', data: { ...at, round: 4, group: null, startHole: null, teeTime: null }, actor: null }).body).toBe('Empezó el día 4.')
    expect(noticeLine({ kind: 'round_live', data: { ...at, round: 2, group: 1, startHole: 1, teeTime: null }, actor: null }).body).toBe('Empezó el día 2. Tu grupo 1 sale del hoyo 1.')
    expect(noticeLine({ kind: 'round_live', data: { ...at, round: 2, group: 1, startHole: 1, teeTime: '13:30' }, actor: null }).body).toBe('Empezó el día 2. Tu grupo 1 sale del hoyo 1 a las 13:30.')
    // A card to sign opens the whole card, where «Firmar» is.
    expect(noticeLine({ kind: 'card_to_sign', data: { ...at, round: 1, group: 2 }, actor: null })).toEqual({
      text: 'Firma la tarjeta del día 1 en Nacho’s Bachelor',
      to: '/t/nachos-bachelor/tarjeta?vista=tarjeta',
      title: 'Nacho’s Bachelor',
      body: 'Tu grupo terminó el día 1: firma la tarjeta de la otra pareja.',
    })
    // The snake's question opens its hole: saving it again asks «¿Quién embocó al último?».
    expect(noticeLine({ kind: 'snake_tiebreak', data: { ...at, round: 2, group: 1, hole: 7, game: 'La Víbora' }, actor: null })).toEqual({
      text: 'La Víbora en Nacho’s Bachelor: falta decir quién embocó al último en el 7',
      to: '/t/nachos-bachelor/tarjeta?hoyo=7',
      title: 'Nacho’s Bachelor',
      body: 'La Víbora, día 2: falta decir quién embocó al último en el hoyo 7.',
    })
    // A Comité correction (0062, TRUST-14) says the day: never the hole, the value, the reason or who. It opens
    // the phone's own player's sheet, where every day's card is.
    expect(noticeLine({ kind: 'score_corrected', data: { ...at, round: 2 }, actor: null })).toEqual({
      text: 'El Comité corrigió tu tarjeta del día 2 en Nacho’s Bachelor',
      to: '/t/nachos-bachelor?jugador=yo',
      title: 'Nacho’s Bachelor',
      body: t.social.notice.scoreCorrectedBody(2),
    })
    expect(t.social.notice.scoreCorrectedBody(2)).toBe('El Comité corrigió tu tarjeta del día 2. Toca para ver qué cambió y por qué.')
    for (const kind of ['round_live', 'card_to_sign', 'snake_tiebreak', 'score_corrected', 'results']) {
      const line = noticeLine({ kind, data: { ...at, round: 1, group: 1, hole: 3, game: 'La Víbora', rankLabel: '2', field: 12 }, actor: null })
      expect(`${line.text} ${line.body ?? ''}`, kind).not.toMatch(/\$|\d+,\d{3}/)
    }
  })

  it('a tournament notice with a slug that is not one goes home; one without a game says the snake', () => {
    expect(noticeLine({ kind: 'round_live', data: { tournament: 'X', slug: '../admin', round: 1 }, actor: null }).to).toBe('/')
    expect(noticeLine({ kind: 'card_to_sign', data: { tournament: 'X', round: 1 }, actor: null }).to).toBe('/')
    expect(noticeLine({ kind: 'snake_tiebreak', data: { tournament: 'X', slug: 'x', round: 1, hole: 4 }, actor: null }).body).toBe('La Víbora, día 1: falta decir quién embocó al último en el hoyo 4.')
  })

  it('a notice from the Admin de Polo carries its own title for the push, and stays inside Polo', () => {
    const n = noticeLine({ kind: 'platform_notice', data: { title: 'Mantenimiento', body: 'Polo se actualiza a las 11.', url: '/crews' }, actor: null })
    expect(n).toEqual({ text: 'Mantenimiento: Polo se actualiza a las 11.', to: '/crews', title: 'Mantenimiento', body: 'Polo se actualiza a las 11.' })
    for (const url of ['https://evil.example', '//evil.example', 'javascript:alert(1)', '/ok<script>']) {
      expect(noticeLine({ kind: 'platform_notice', data: { title: 'x', body: 'y', url }, actor: null }).to).toBe('/avisos')
    }
  })
})
