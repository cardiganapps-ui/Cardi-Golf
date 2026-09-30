// UX panel harness: phone context, tap/typing counter, app-time accounting, target measurement.
import { chromium } from 'playwright-core'
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

export const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
export const BASE = 'http://127.0.0.1:4173'
export const S = '/tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad'
export const EV = `${S}/panel/evidence/UX`
export const SHOTS = '/home/user/Cardi-Golf/docs/review/2026-09-30/shots'
mkdirSync(EV, { recursive: true })
mkdirSync(SHOTS, { recursive: true })

export async function launch() {
  return chromium.launch({ executablePath: EXE })
}

/** iPhone-15-Pro-sized phone: 393x852 @2x, touch. `blockSupabase` aborts every Supabase request (fixtures must not hit prod). */
export async function phone(browser, { blockSupabase = false, storageState, width = 393, height = 852 } = {}) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: 'es-MX',
    timezoneId: 'America/Mazatlan',
    storageState,
  })
  if (blockSupabase) await ctx.route(/supabase\.co/, (r) => r.abort())
  return ctx
}

/** Thumb zone for a right-handed one-hand grip on a 393x852 screen (Hoober-style bands). */
export function zone(y, x, H = 852, W = 393) {
  const fy = y / H
  if (fy < 0.25) return x < W * 0.5 ? 'hard (top-left)' : 'hard (top)'
  if (fy < 0.5) return 'stretch'
  return 'easy'
}

export class Journey {
  constructor(name, page) {
    this.name = name
    this.page = page
    this.taps = 0
    this.keys = 0
    this.appMs = 0
    this.steps = []
    this.deadEnds = []
    this.notes = []
    this.t0 = Date.now()
  }
  async _box(locator) {
    try {
      const b = await locator.boundingBox()
      return b ? { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2), w: Math.round(b.width), h: Math.round(b.height) } : null
    } catch {
      return null
    }
  }
  /** One user tap. `expect` is an async condition that marks the UI response; its time counts as app time. */
  async tap(locator, label, expect) {
    const loc = locator.first()
    await loc.waitFor({ state: 'visible', timeout: 15000 })
    await loc.scrollIntoViewIfNeeded().catch(() => {})
    const box = await this._box(loc)
    const t0 = performance.now()
    await loc.tap({ timeout: 15000 })
    if (expect) await expect()
    const dt = performance.now() - t0
    this.taps++
    this.appMs += dt
    this.steps.push({ kind: 'tap', label, ms: Math.round(dt), box, zone: box ? zone(box.y, box.x) : null })
    return dt
  }
  /** Typing counts one tap to focus (if focus=true) plus one per character. */
  async type(locator, text, label, { focus = true, clear = false } = {}) {
    const loc = locator.first()
    await loc.waitFor({ state: 'visible', timeout: 15000 })
    const box = await this._box(loc)
    const t0 = performance.now()
    if (focus) {
      await loc.tap()
      this.taps++
    }
    if (clear) await loc.fill('')
    await loc.pressSequentially(String(text), { delay: 0 })
    const dt = performance.now() - t0
    this.keys += String(text).length
    this.appMs += dt
    this.steps.push({ kind: 'type', label, chars: String(text).length, ms: Math.round(dt), box, zone: box ? zone(box.y, box.x) : null })
  }
  /** A scroll the user has to do to reach a control (counts as a gesture, not a tap). */
  scroll(label) {
    this.steps.push({ kind: 'scroll', label })
  }
  deadEnd(msg) {
    this.deadEnds.push(msg)
  }
  note(msg) {
    this.notes.push(msg)
  }
  summary() {
    const scrolls = this.steps.filter((s) => s.kind === 'scroll').length
    return { journey: this.name, taps: this.taps, keystrokes: this.keys, scrolls, appMs: Math.round(this.appMs), wallMs: Date.now() - this.t0, deadEnds: this.deadEnds, notes: this.notes, steps: this.steps }
  }
}

export function saveJson(name, obj) {
  writeFileSync(`${EV}/${name}.json`, JSON.stringify(obj, null, 2))
}
export function log(name, line) {
  appendFileSync(`${EV}/${name}.log`, line + '\n')
  console.log(line)
}

/** Screenshot into the shared shots dir with the brief's naming, then compress. */
export async function shot(page, file, { fullPage = false } = {}) {
  const path = `${SHOTS}/${file}`
  await page.screenshot({ path, fullPage })
  try {
    execFileSync('node', [`${S}/tools/compress-png.mjs`, path], { stdio: 'ignore' })
  } catch {}
  return `docs/review/2026-09-30/shots/${file}`
}

/** Every interactive element in view (or the whole page) with its box; flags the ones under min x min. */
export async function measureTargets(page, { min = 48, scope = 'body' } = {}) {
  return page.evaluate(
    ({ min, scope }) => {
      const root = document.querySelector(scope) || document.body
      const sel = 'button, a[href], input, select, textarea, [role="button"], [role="tab"], [role="radio"], [role="checkbox"], [role="switch"], [tabindex]:not([tabindex="-1"]), summary, label[for]'
      const out = []
      for (const el of root.querySelectorAll(sel)) {
        const r = el.getBoundingClientRect()
        if (r.width === 0 || r.height === 0) continue
        const cs = getComputedStyle(el)
        if (cs.visibility === 'hidden' || cs.display === 'none') continue
        const name = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || el.getAttribute('name') || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 50)
        out.push({ tag: el.tagName.toLowerCase(), name, x: Math.round(r.x), y: Math.round(r.y + window.scrollY), w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10, small: r.width < min || r.height < min, disabled: !!el.disabled })
      }
      return out
    },
    { min, scope },
  )
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
