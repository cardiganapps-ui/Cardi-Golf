// @vitest-environment happy-dom
/**
 * VIS-11, A11Y-19: Más › Apariencia. index.html's head script applies the stored
 * choice before the first paint, `applyAppearance` once the app runs: for every
 * stored value both put the same attributes on <html> and the same colour on
 * the status bar, and neither throws when the browser keeps nothing.
 */
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CONTRAST_KEY, THEME_COLOR, THEME_KEY, applyAppearance, contrastChoice, resolvedTheme, setContrastChoice, setThemeChoice, themeChoice } from './theme'

const html = readFileSync('index.html', 'utf8')
const head = html.slice(0, html.indexOf('</head>'))
const bootScript = /<script>([\s\S]*?)<\/script>/.exec(head)?.[1] ?? ''
const metas = [...head.matchAll(/<meta name="theme-color" content="(#[0-9A-Fa-f]{6})" media="([^"]+)" \/>/g)]
const tokens = readFileSync('src/styles/tokens.css', 'utf8')

function reset() {
  document.head.innerHTML = metas.map((m) => `<meta name="theme-color" content="${m[1]}" media="${m[2]}">`).join('')
  document.documentElement.removeAttribute('data-theme')
  document.documentElement.removeAttribute('data-contrast')
}
function snapshot() {
  const root = document.documentElement
  return { theme: root.getAttribute('data-theme'), contrast: root.getAttribute('data-contrast'), bar: [...document.querySelectorAll('meta[name="theme-color"]')].map((m) => m.getAttribute('content')) }
}

beforeEach(() => {
  localStorage.clear()
  reset()
})
afterEach(() => vi.restoreAllMocks())

describe('appearance (VIS-11, A11Y-19)', () => {
  it('index.html runs a script in its head, before the stylesheet and the app', () => {
    expect(bootScript).toContain('cardi-golf:theme')
    expect(head.indexOf('<script>')).toBeLessThan(html.indexOf('<script type="module"'))
  })

  it('carries a status-bar colour for each scheme, the ones the app sets', () => {
    expect(metas.map((m) => [m[1], m[2]])).toEqual([
      [THEME_COLOR.light, '(prefers-color-scheme: light)'],
      [THEME_COLOR.dark, '(prefers-color-scheme: dark)'],
    ])
    // The dark one is the dark sheet itself (tokens.css --bg), so the bar and the page meet.
    expect(tokens).toMatch(new RegExp(`:root\\[data-theme='dark'\\] \\{[^}]*--bg: ${THEME_COLOR.dark.toLowerCase()};`))
    // The light one is the platform's fairway, as the manifest's (appManifest.test.ts).
    expect(tokens).toMatch(new RegExp(`\\[data-theme='light'\\]\\) \\{[^}]*--accent: ${THEME_COLOR.light.toLowerCase()};`))
    expect(head).toContain('<meta name="color-scheme" content="light dark" />')
  })

  const cases: Array<[string | null, string | null]> = [
    [null, null],
    ['light', null],
    ['dark', null],
    ['dark', 'more'],
    [null, 'more'],
    ['light', 'normal'],
    ['sepia', 'loud'],
  ]
  it.each(cases)('theme %s, contrast %s: the head script and applyAppearance agree', (theme, contrast) => {
    if (theme) localStorage.setItem(THEME_KEY, theme)
    if (contrast) localStorage.setItem(CONTRAST_KEY, contrast)
    new Function(bootScript)()
    const fromBoot = snapshot()
    reset()
    applyAppearance()
    expect(snapshot()).toEqual(fromBoot)
    // Unknown values are the phone's own setting.
    if (theme === 'sepia') expect(fromBoot.theme).toBeNull()
  })

  it('an explicit choice gives both bars its colour; «Sistema» gives each scheme its own', () => {
    setThemeChoice('dark')
    expect(snapshot()).toEqual({ theme: 'dark', contrast: null, bar: [THEME_COLOR.dark, THEME_COLOR.dark] })
    setThemeChoice('light')
    expect(snapshot().bar).toEqual([THEME_COLOR.light, THEME_COLOR.light])
    setThemeChoice('system')
    expect(snapshot()).toEqual({ theme: null, contrast: null, bar: [THEME_COLOR.light, THEME_COLOR.dark] })
    expect(localStorage.getItem(THEME_KEY)).toBeNull()
    setContrastChoice('more')
    expect(snapshot().contrast).toBe('more')
    expect(contrastChoice()).toBe('more')
    setContrastChoice('system')
    expect(snapshot().contrast).toBeNull()
  })

  it('«Sistema» follows the phone', () => {
    vi.spyOn(window, 'matchMedia').mockImplementation((q: string) => ({ matches: q.includes('dark'), media: q, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList)
    expect(themeChoice()).toBe('system')
    expect(resolvedTheme()).toBe('dark')
    expect(resolvedTheme('light')).toBe('light')
  })

  it('a browser that keeps nothing follows the phone, and neither path throws', () => {
    vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    expect(() => new Function(bootScript)()).not.toThrow()
    expect(snapshot().theme).toBeNull()
    expect(() => setThemeChoice('dark')).not.toThrow()
    expect(themeChoice()).toBe('system')
  })
})
