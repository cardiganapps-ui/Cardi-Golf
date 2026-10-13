/** PWA-09: Home's field took six letters and digits only, so a pasted link read «HTTPS» and «Entrar» stayed off. */
import { describe, expect, it } from 'vitest'
import { joinTarget } from './joinInput'

describe('what a player types or pastes to join (PWA-09)', () => {
  it('a code, as typed', () => {
    expect(joinTarget('NACHO1')).toBe('NACHO1')
    expect(joinTarget('  nacho1 ')).toBe('nacho1')
  })

  it('a link, from the tournament’s own name in it', () => {
    expect(joinTarget('https://golf.cardigan.mx/t/ensayo')).toBe('ensayo')
    expect(joinTarget('golf.cardigan.mx/t/nachos-bachelor')).toBe('nachos-bachelor')
    expect(joinTarget('https://golf.cardigan.mx/t/nachos-bachelor/tarjeta?hoyo=3')).toBe('nachos-bachelor')
    expect(joinTarget('https://golf.cardigan.mx/t/NACHO1')).toBe('NACHO1')
  })

  it('the whole invitation: its link, or else the code it gives', () => {
    expect(joinTarget('Nacho’s Bachelor: entra con el código NACHO1 https://golf.cardigan.mx/t/nachos-bachelor')).toBe('nachos-bachelor')
    expect(joinTarget('Nacho’s Bachelor: entra con el código NACHO1')).toBe('NACHO1')
    expect(joinTarget('el codigo es nacho1, nos vemos')).toBe('NACHO1')
  })

  it('a slug on its own', () => {
    expect(joinTarget('nachos-bachelor')).toBe('nachos-bachelor')
  })

  it('nothing that names a tournament: no way in', () => {
    expect(joinTarget('')).toBeNull()
    expect(joinTarget('x')).toBeNull()
    expect(joinTarget('hola amigos')).toBeNull()
    expect(joinTarget('https://golf.cardigan.mx/')).toBeNull()
    expect(joinTarget('https://golf.cardigan.mx/t/_/full12-live')).toBeNull()
  })
})
