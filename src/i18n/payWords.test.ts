/**
 * Who pays whom, in words (COPY-08). The settlement read «Leonel paga a
 * Banco» and «Banco paga a Iván J.» while the header said «Banco: Iván J.»:
 * the bank as a person's name, and the banker paying himself.
 */
import { describe, expect, it } from 'vitest'
import { t } from './es-MX'

const M = t.moneyScreen

describe('who pays whom, in words (COPY-08)', () => {
  it('the bank is no one’s name: it takes its article', () => {
    expect(M.pays('Leonel', null, '$2,500')).toBe('Leonel le paga al banco: $2,500')
    expect(M.pays(null, 'Camilo', '$3,300')).toBe('El banco le paga a Camilo: $3,300')
    expect(M.pays('Leonel', 'Camilo', '$200')).toBe('Leonel le paga a Camilo: $200')
  })

  it('the banker with his own bank is his own money going in or coming out', () => {
    expect(M.pays('Iván J.', null, '$2,500', true)).toBe('Iván J. pone lo suyo en el banco: $2,500')
    expect(M.pays(null, 'Iván J.', '$3,300', true)).toBe('Iván J. se queda con lo suyo del banco: $3,300')
  })

  it('what was paid, and two parties that square up', () => {
    expect(M.payText(M.payWords('Leonel', null, true))).toBe('Leonel le pagó al banco')
    expect(M.payText(M.payWords(null, 'Camilo', true))).toBe('El banco le pagó a Camilo')
    expect(M.payText(M.payWords('Iván J.', null, true, true))).toBe('Iván J. puso lo suyo en el banco')
    expect(M.squared('Leonel', null)).toBe('Leonel queda a mano con el banco')
    expect(M.squared(null, 'Camilo')).toBe('Camilo queda a mano con el banco')
    expect(M.squared('Leonel', 'Camilo')).toBe('Leonel y Camilo quedan a mano')
  })

  it('the explanations say it the same way', () => {
    const W = t.settleWhy
    expect(W.owesTotal(null, '$500')).toBe('El banco todavía debe $500 en total')
    expect(W.share(null, '$900', '$300', 'Camilo')).toBe('De los $900 que debe el banco, $300 van a Camilo.')
    expect(W.share('Leonel', '$900', '$300', null)).toBe('De los $900 que debe Leonel, $300 van al banco.')
  })
})
