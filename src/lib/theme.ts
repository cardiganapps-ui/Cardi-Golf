/**
 * Appearance, on this phone only (VIS-11, A11Y-19): light, dark or the phone's
 * own setting, and more contrast for the sun. Más › Apariencia sets them; the
 * appearance script in index.html's head applies the stored choice before the
 * first paint, as `applyAppearance` does (theme.test.ts runs both on the same
 * storage), so a phone set to «Oscuro» never flashes the card stock.
 *
 * The choice is `<html data-theme>` and `<html data-contrast>`, which
 * tokens.css reads; the phone's own setting needs no attribute (the media
 * queries answer it). Kept in localStorage, a convenience: a browser that
 * keeps nothing follows the phone's setting.
 */
import { useSyncExternalStore } from 'react'

export type ThemeChoice = 'system' | 'light' | 'dark'
/** `system`: the phone's «Aumentar contraste»; `more` and `normal` say otherwise on this phone. */
export type ContrastChoice = 'system' | 'more' | 'normal'

export const THEME_KEY = 'cardi-golf:theme'
export const CONTRAST_KEY = 'cardi-golf:contrast'

/** The status bar's colour (theme-color) in each theme: the platform's fairway, and the dark sheet. tokens.css holds both. */
export const THEME_COLOR = { light: '#1E6B3B', dark: '#131715' } as const

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
function write(key: string, value: string | null): void {
  try {
    if (value == null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // A browser that keeps nothing: the choice holds for this page.
  }
}

export function themeChoice(): ThemeChoice {
  const v = read(THEME_KEY)
  return v === 'light' || v === 'dark' ? v : 'system'
}
export function contrastChoice(): ContrastChoice {
  const v = read(CONTRAST_KEY)
  return v === 'more' || v === 'normal' ? v : 'system'
}

function media(query: string): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches
}

/** The theme on screen now: the choice, or the phone's setting under «Sistema». */
export function resolvedTheme(choice: ThemeChoice = themeChoice()): 'light' | 'dark' {
  return choice === 'system' ? (media('(prefers-color-scheme: dark)') ? 'dark' : 'light') : choice
}
/** Whether more contrast is on now. */
export function contrastOn(choice: ContrastChoice = contrastChoice()): boolean {
  return choice === 'system' ? media('(prefers-contrast: more)') : choice === 'more'
}

/** Puts the choices on the page: the attributes tokens.css reads, and the status bar's colour. */
export function applyAppearance(doc: Document = document): void {
  const root = doc.documentElement
  const theme = themeChoice()
  const contrast = contrastChoice()
  if (theme === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', theme)
  if (contrast === 'system') root.removeAttribute('data-contrast')
  else root.setAttribute('data-contrast', contrast)
  // index.html carries one theme-color per scheme; a choice over the phone's setting gives both its own colour.
  for (const meta of doc.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    const scheme = /dark/.test(meta.getAttribute('media') ?? '') ? 'dark' : 'light'
    meta.content = THEME_COLOR[theme === 'system' ? scheme : theme]
  }
}

const listeners = new Set<() => void>()
function changed() {
  applyAppearance()
  for (const l of listeners) l()
}
export function setThemeChoice(choice: ThemeChoice): void {
  write(THEME_KEY, choice === 'system' ? null : choice)
  changed()
}
export function setContrastChoice(choice: ContrastChoice): void {
  write(CONTRAST_KEY, choice === 'system' ? null : choice)
  changed()
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  // The phone's setting can change under «Sistema» (sunset, Control Center): what the switch shows follows it.
  const queries = typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? [window.matchMedia('(prefers-color-scheme: dark)'), window.matchMedia('(prefers-contrast: more)')] : []
  for (const q of queries) q.addEventListener?.('change', fn)
  // Another tab of the app changed it.
  const onStorage = (e: StorageEvent) => {
    if (e.key === THEME_KEY || e.key === CONTRAST_KEY) changed()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(fn)
    for (const q of queries) q.removeEventListener?.('change', fn)
    window.removeEventListener('storage', onStorage)
  }
}

/** Más › Apariencia: the stored choices and what they come to on this phone now. */
export function useAppearance(): { theme: ThemeChoice; contrast: ContrastChoice; dark: boolean; more: boolean } {
  const key = useSyncExternalStore(
    subscribe,
    () => `${themeChoice()}|${contrastChoice()}|${resolvedTheme()}|${contrastOn()}`,
    () => 'system|system|light|false',
  )
  const [theme, contrast, dark, more] = key.split('|') as [ThemeChoice, ContrastChoice, string, string]
  return { theme, contrast, dark: dark === 'dark', more: more === 'true' }
}
