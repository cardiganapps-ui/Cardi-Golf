// @vitest-environment happy-dom
/** UX-20: PINs the Comité generates, and the invite link that never carries one. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { inviteUrl, randomPin, randomPins, shareToWhatsApp, weakPin } from './pins'

afterEach(() => vi.unstubAllGlobals())

describe('PINs', () => {
  it('are four digits and never the ones a person guesses first', () => {
    for (const p of ['0000', '7777', '1234', '6789', '9876', '3210', '12', 'abcd']) expect(weakPin(p), p).toBe(true)
    for (const p of ['1357', '0042', '2468', '9110']) expect(weakPin(p), p).toBe(false)
    for (let i = 0; i < 500; i++) {
      const p = randomPin()
      expect(p).toMatch(/^\d{4}$/)
      expect(weakPin(p)).toBe(false)
    }
  })

  it('skip values above the last whole block of 10,000, so no PIN is likelier than another', () => {
    // 60,123 would be «0123» with a bias; the next value, 4,242, is taken.
    const fake = vi.fn((buf: Uint16Array) => {
      buf.set([60_123, 4242, 0, 0, 0, 0, 0, 0])
      return buf
    })
    expect(randomPin(fake)).toBe('4242')
  })

  it('a batch is all different', () => {
    const pins = randomPins(60)
    expect(new Set(pins).size).toBe(60)
  })

  it('the invite opens the player’s face, and carries no PIN', () => {
    const url = inviteUrl('https://polo.example', 'copa-2027', 'b7f0c0de-1111-4222-8333-944455556666')
    expect(url).toBe('https://polo.example/t/copa-2027?soy=b7f0c0de-1111-4222-8333-944455556666')
    expect(url).not.toMatch(/pin/i)
  })
})

describe('shareToWhatsApp', () => {
  it('uses the phone’s share sheet where there is one', async () => {
    const share = vi.fn(async () => undefined)
    vi.stubGlobal('navigator', { ...navigator, share })
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    await shareToWhatsApp('Hola')
    expect(share).toHaveBeenCalledWith({ text: 'Hola' })
    expect(open).not.toHaveBeenCalled()
  })

  it('else WhatsApp’s own link, with the message written', async () => {
    vi.stubGlobal('navigator', { ...navigator, share: undefined })
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    await shareToWhatsApp('Hola, Ana: entra aquí')
    expect(open).toHaveBeenCalledWith(`https://wa.me/?text=${encodeURIComponent('Hola, Ana: entra aquí')}`, '_blank', 'noopener')
  })

  it('a share the person closed opens nothing else', async () => {
    vi.stubGlobal('navigator', { ...navigator, share: vi.fn(async () => Promise.reject(Object.assign(new Error('x'), { name: 'AbortError' }))) })
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    await shareToWhatsApp('Hola')
    expect(open).not.toHaveBeenCalled()
  })
})
