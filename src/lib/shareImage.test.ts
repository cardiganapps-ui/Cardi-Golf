// @vitest-environment happy-dom
/**
 * PWA-04: share cards failed offline (html-to-image cache-busted the
 * precached fonts) and one failure broke sharing for the rest of the session
 * (it kept failures in a module cache). Now the card's files are inlined here
 * first, and only what loaded is remembered. A logo the service worker cached
 * as an opaque response is read again from the network; an image that still
 * fails is a transparent pixel, never a URL html-to-image would fetch.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { _shareTest, NO_IMAGE, codePointsIn, coversAny, fontEmbedCss, inlineImages, type PageFontFace } from './shareImage'

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

const SPANISH = codePointsIn('Camilo Duarte, Íñigo: $1,500 − «Mejor ronda» ¿quién? 1.º')
beforeEach(() => _shareTest.reset())

describe('the card embeds only what it needs', () => {
  it('the subsets the text needs: Spanish is all Latin; a Polish name brings latin-ext', () => {
    expect(coversAny(LATIN, SPANISH)).toBe(true)
    expect(coversAny(LATIN_EXT, SPANISH)).toBe(false)
    expect(coversAny(VIETNAMESE, SPANISH)).toBe(false)
    expect(coversAny(LATIN_EXT, codePointsIn('Łukasz'))).toBe(true)
    expect(coversAny('', SPANISH)).toBe(true)
    expect(coversAny('U+00??', codePointsIn('A'))).toBe(true)
  })

  it('the families the card uses, every file inlined', async () => {
    const load = vi.fn(async (url: string) => `data:font/woff2;base64,${btoa(url)}`)
    const css = await fontEmbedCss(FACES, new Set(['archivo']), SPANISH, load)
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
    expect(await fontEmbedCss(FACES, new Set(['archivo']), SPANISH, load)).toBe('')
    online = true
    expect(await fontEmbedCss(FACES, new Set(['archivo']), SPANISH, load)).toContain('data:font/woff2')
    expect(await fontEmbedCss(FACES, new Set(['archivo']), SPANISH, load)).toContain('data:font/woff2')
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('an image that cannot load is a hidden transparent pixel for this render only; the others are inlined, and all restored after', async () => {
    const node = document.createElement('div')
    node.innerHTML = '<img src="http://polo.test/logo.png" srcset="http://polo.test/logo@2x.png 2x"><img src="http://polo.test/avatar.jpg">'
    const [logo, avatar] = Array.from(node.querySelectorAll('img'))
    const load = vi.fn(async (url: string) => {
      if (url.endsWith('avatar.jpg')) throw new TypeError('Failed to fetch')
      return 'data:image/png;base64,AAAA'
    })
    const restore = await inlineImages(node, load)
    expect(logo!.getAttribute('src')).toBe('data:image/png;base64,AAAA')
    // html-to-image would choose from srcset and fetch it itself.
    expect(logo!.hasAttribute('srcset')).toBe(false)
    // Never the URL: html-to-image would fetch it and reject the whole card.
    expect(avatar!.getAttribute('src')).toBe(NO_IMAGE)
    expect(avatar!.style.visibility).toBe('hidden')
    restore()
    expect(logo!.getAttribute('src')).toBe('http://polo.test/logo.png')
    expect(logo!.getAttribute('srcset')).toBe('http://polo.test/logo@2x.png 2x')
    expect(avatar!.getAttribute('src')).toBe('http://polo.test/avatar.jpg')
    expect(avatar!.style.visibility).toBe('')
    // Signal back: the avatar is tried again.
    load.mockImplementation(async () => 'data:image/jpeg;base64,BBBB')
    await inlineImages(node, load)
    expect(avatar!.getAttribute('src')).toBe('data:image/jpeg;base64,BBBB')
  })
})

describe('a logo the service worker cached as an opaque response (PWA-04)', () => {
  const png = () => new Response(new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' }), { status: 200 })
  const logoNode = () => {
    const node = document.createElement('div')
    node.innerHTML = '<img src="https://x.supabase.co/storage/v1/object/public/tournament-assets/t1/logo.png?v=3">'
    return [node, node.querySelector('img')!] as const
  }

  it('with signal, is read again under a URL of its own, straight from the network', async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce(png())
    vi.stubGlobal('fetch', fetchMock)
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })
    const [node, img] = logoNode()
    await inlineImages(node)
    expect(img.getAttribute('src')).toMatch(/^data:image\/png;base64,/)
    const [retry, init] = fetchMock.mock.calls[1]!
    expect(new URL(retry as string).searchParams.get('v')).toBe('3')
    expect(new URL(retry as string).searchParams.get('polo-share')).toMatch(/^\d+$/)
    expect(init).toMatchObject({ cache: 'no-store' })
    vi.unstubAllGlobals()
  })

  it('offline, is a transparent pixel and nothing is retried', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    vi.stubGlobal('fetch', fetchMock)
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })
    const [node, img] = logoNode()
    await inlineImages(node)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(img.getAttribute('src')).toBe(NO_IMAGE)
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })
    vi.unstubAllGlobals()
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
