// V3 verifier harness: phone contexts against MY preview server (:4203), Supabase always blocked.
import { chromium } from 'playwright-core'
import { appendFileSync, mkdirSync } from 'node:fs'

export const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
export const BASE = 'http://127.0.0.1:4203'
export const V3 = '/tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad/verify/evidence/V3'
export const SHOTS = '/home/user/Cardi-Golf/docs/review/2026-09-30/shots'
mkdirSync(SHOTS, { recursive: true })

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
export const launch = () => chromium.launch({ executablePath: EXE })

/**
 * A phone: touch, mobile viewport, service workers blocked (so page.route sees every request),
 * and every supabase.co request either aborted (default) or handed to `onSupabase(route)`.
 */
export async function phone(browser, { width = 393, height = 852, insets = null, onSupabase = null } = {}) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: 'es-MX',
    timezoneId: 'America/Mazatlan',
    serviceWorkers: 'block',
  })
  await ctx.route(/supabase\.co/, (route) => (onSupabase ? onSupabase(route) : route.abort()))
  const page = await ctx.newPage()
  if (insets) {
    const cdp = await ctx.newCDPSession(page)
    await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets })
  }
  return { ctx, page }
}

export function logTo(file) {
  return (...a) => {
    const line = a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ')
    console.log(line)
    appendFileSync(`${V3}/${file}`, line + '\n')
  }
}

/** Describe the focused element in a short, stable way. */
export async function focused(page) {
  return page.evaluate(() => {
    const el = document.activeElement
    if (!el || el === document.body) return 'BODY'
    const lab = el.getAttribute('aria-label') || el.closest('label')?.textContent?.trim().slice(0, 25) || el.textContent?.trim().slice(0, 25) || ''
    const inDialog = !!el.closest('[role=dialog]')
    return `${el.tagName}${el.getAttribute('role') ? `[role=${el.getAttribute('role')}]` : ''} "${lab}"${inDialog ? ' (in sheet)' : ' (OUTSIDE sheet)'}`
  })
}

/** Values of every text-like field in the open sheet, labelled by their <Field> label. */
export async function sheetValues(page) {
  return page.evaluate(() => {
    const d = [...document.querySelectorAll('[role=dialog]')].at(-1)
    if (!d) return null
    return [...d.querySelectorAll('input:not([type=checkbox]):not([type=file]), textarea')].map((i) => {
      const f = i.closest('label, .field, [class*=field]')
      const lab = i.getAttribute('aria-label') || f?.querySelector('.label, [class*=label]')?.textContent?.trim() || f?.textContent?.trim().slice(0, 20) || i.placeholder || '?'
      return `${lab}=${JSON.stringify(i.value)}`
    })
  })
}
