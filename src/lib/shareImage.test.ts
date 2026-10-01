// @vitest-environment happy-dom
/**
 * PWA-04: share cards failed offline (html-to-image cache-busted the
 * precached fonts) and one failure broke sharing for the rest of the session
 * (it kept failures in a module cache). Now the card's files are inlined here
 * first, and only what loaded is remembered.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { _shareTest, coversLatin, fontEmbedCss, inlineImages, type PageFontFace } from './shareImage'

// Fontsource's subsets for one family, as the stylesheet declares them.
const LATIN = 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD'
const LATIN_EXT = 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF'
const VIETNAMESE = 'U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169, U+01A0-01A1, U+01AF-01B0, U+0300-0301, U+0303-0304, U+0308-0309, U+0323, U+0329, U+1EA0-1EF9, U+20AB'

const face = (family: string, subset: string, range: string): PageFontFace => ({
  family,
  url: `http://polo.test/assets/${family}-${subset}.woff2`,
  unicodeRange: range,
  cssText: `@font-face { font-family: "${family}"; font-style: normal; font-weight: 100 900; src: url("/assets/${family}-${subset}.woff2") format("woff2-variations"); unicode-range: ${range}; }`,
})
const FACES = [face('archivo', 'latin', LATIN), face('archivo', 'latin-ext', LATIN_EXT), face('archivo', 'vietnamese', VIETNAMESE), face('fraunces', 'latin', LATIN)]

beforeEach(() => _shareTest.reset())

describe('the card embeds only what it needs', () => {
  it('the Latin subset, not latin-ext or Vietnamese', () => {
    expect(coversLatin(LATIN)).toBe(true)
    expect(coversLatin(LATIN_EXT)).toBe(false)
    expect(coversLatin(VIETNAMESE)).toBe(false)
    expect(coversLatin('')).toBe(true)
    expect(coversLatin('U+00??')).toBe(true)
  })

  it('the families the card uses, every file inlined', async () => {
    const load = vi.fn(async (url: string) => `data:font/woff2;base64,${btoa(url)}`)
    const css = await fontEmbedCss(FACES, new Set(['archivo']), load)
    expect(load).toHaveBeenCalledTimes(1)
    expect(load).toHaveBeenCalledWith('http://polo.test/assets/archivo-latin.woff2')
    expect(css).toContain('src: url("data:font/woff2;base64,')
    expect(css).not.toContain('/assets/')
    expect(css).toContain('unicode-range')
  })
})

describe('a failure is never remembered (the session is not poisoned)', () => {
  it('a font that failed offline is fetched again next time, and a loaded one is kept', async () => {
    let online = false
    const load = vi.fn(async (url: string) => {
      if (!online) throw new TypeError('Failed to fetch')
      return `data:font/woff2;base64,${btoa(url)}`
    })
    expect(await fontEmbedCss(FACES, new Set(['archivo']), load)).toBe('')
    online = true
    expect(await fontEmbedCss(FACES, new Set(['archivo']), load)).toContain('data:font/woff2')
    expect(await fontEmbedCss(FACES, new Set(['archivo']), load)).toContain('data:font/woff2')
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('an image that cannot load is hidden for this render only; the others are inlined, and all restored after', async () => {
    const node = document.createElement('div')
    node.innerHTML = '<img src="http://polo.test/logo.png"><img src="http://polo.test/avatar.jpg">'
    const [logo, avatar] = Array.from(node.querySelectorAll('img'))
    const load = vi.fn(async (url: string) => {
      if (url.endsWith('avatar.jpg')) throw new TypeError('Failed to fetch')
      return 'data:image/png;base64,AAAA'
    })
    const restore = await inlineImages(node, load)
    expect(logo!.getAttribute('src')).toBe('data:image/png;base64,AAAA')
    expect(avatar!.style.visibility).toBe('hidden')
    restore()
    expect(logo!.getAttribute('src')).toBe('http://polo.test/logo.png')
    expect(avatar!.style.visibility).toBe('')
    // Signal back: the avatar is tried again.
    load.mockImplementation(async () => 'data:image/jpeg;base64,BBBB')
    await inlineImages(node, load)
    expect(avatar!.getAttribute('src')).toBe('data:image/jpeg;base64,BBBB')
  })
})

describe('iOS shares only inside the tap', () => {
  it('when the render outlasted the tap, the ready image is offered for a second tap', async () => {
    const file = new File(['png'], 'tabla.png', { type: 'image/png' })
    const share = vi.fn().mockRejectedValueOnce(new DOMException('not allowed', 'NotAllowedError')).mockResolvedValueOnce(undefined)
    Object.assign(navigator, { canShare: () => true, share })
    let again: (() => Promise<string>) | null = null
    expect(await _shareTest.share(file, 'Tabla', undefined, (fn) => (again = fn))).toBe('cancelled')
    expect(again).not.toBeNull()
    expect(await again!()).toBe('shared')
    expect(share).toHaveBeenCalledTimes(2)
    expect(share.mock.calls[1]![0]).toMatchObject({ files: [file], title: 'Tabla' })
  })
})
