/**
 * A11Y-11: a board row's spoken name carries what the row shows. It read
 * «1.º, Camilo, hoy 25, hoyo 11, 60»: no unit, no money, no owners, nothing for
 * «tú», the honoree or the arrow; «F» and «E» were read as letters.
 */
import { describe, expect, it } from 'vitest'
import { t } from './es-MX'

describe('t.live.rowLabel (A11Y-11)', () => {
  it('says everything the row shows, in the order a listener needs it', () => {
    expect(
      t.live.rowLabel('1', 'Camilo', '60', '25', '11', {
        me: true,
        honoree: 'El novio',
        tier: 'A',
        unit: 'points',
        money: '$12,200',
        owners: t.live.ownersSpoken(['Iván', 'Camilo']),
        movedBy: 3,
      }),
    ).toBe(
      '1.º, Camilo (tú), El novio, categoría A, 60 puntos, hoy 25 puntos, hoyo 11, ganaría $12,200, dueños: Iván y Camilo, subió 3 lugares',
    )
  })

  it('reads «F» as «terminó» and to-par figures as words', () => {
    expect(t.live.rowLabel('T4', 'Hugo I.', 'E', 'E', 'F', { unit: 'gross' })).toBe(
      'empatado en 4.º, Hugo I., par gross, hoy par gross, terminó',
    )
    expect(t.live.rowLabel('2', 'Ana', '+3', '−2', '9', { unit: 'net' })).toBe(
      '2.º, Ana, 3 sobre par neto, hoy 2 bajo par neto, hoyo 9',
    )
    expect(t.live.rowLabel('3', 'Leo', '−1', undefined, undefined, { unit: 'toPar', movedBy: -1 })).toBe(
      '3.º, Leo, 1 bajo par, bajó 1 lugar',
    )
  })

  it('says how far a row moved since the last look, and nothing when it did not (MOT-06)', () => {
    expect(t.live.rowLabel('2', 'Ana', '40', undefined, undefined, { unit: 'points', movedBy: 1 })).toBe(
      '2.º, Ana, 40 puntos, subió 1 lugar',
    )
    expect(t.live.rowLabel('9', 'Ana', '30', undefined, undefined, { unit: 'points', movedBy: -4 })).toBe(
      '9.º, Ana, 30 puntos, bajó 4 lugares',
    )
    expect(t.live.rowLabel('9', 'Ana', '30', undefined, undefined, { unit: 'points', movedBy: 0 })).toBe(
      '9.º, Ana, 30 puntos',
    )
  })

  it('one point, one owner and an estimated handicap', () => {
    expect(
      t.live.rowLabel('5', 'Iván', '1', undefined, '2', {
        unit: 'points',
        owners: t.live.ownersSpoken(['Damián']),
        estimated: true,
      }),
    ).toBe('5.º, Iván, hándicap estimado, 1 punto, hoyo 2, dueño: Damián')
  })

  it('a day said in words already (a match) is not given a unit again', () => {
    expect(t.live.rowLabel('1', 'Ana', '2', 'ganó 3&2', '18', { unit: 'match', todaySpoken: true })).toBe(
      '1.º, Ana, 2 puntos, hoy ganó 3&2, hoyo 18',
    )
  })

  it('a blank figure says nothing for it', () => {
    expect(t.live.rowLabel('', 'Ana', '–', '–', undefined, { unit: 'points' })).toBe('Ana')
  })
})
