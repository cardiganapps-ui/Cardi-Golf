// SHOTS-B shared helpers: browser contexts, per-shot network/console capture,
// in-page DOM analysis, screenshot + record writing.
import { chromium } from 'playwright-core'
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

export const S = '/tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad'
export const EV = `${S}/panel/evidence/SHOTS-B`
export const OUT = '/home/user/Cardi-Golf/docs/review/2026-09-30/shots'
export const BASE = 'http://127.0.0.1:4173'
export const MAX_H = 3200
mkdirSync(OUT, { recursive: true })
mkdirSync(`${EV}/records`, { recursive: true })

export const DEVICES = {
  laptop: { width: 1440, height: 900, dsf: 1 },
  '15pro': { width: 393, height: 852, dsf: 2 },
  tv: { width: 1920, height: 1080, dsf: 1 },
}

let browser
export async function launch() {
  browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
  return browser
}
export async function close() {
  await browser?.close()
}

/** One context per device/motion combo; reused across shots (no sign-ins happen on fixture routes anyway). */
export async function newPage(device, { reducedMotion = 'reduce', init } = {}) {
  const d = DEVICES[device]
  const ctx = await browser.newContext({ viewport: { width: d.width, height: d.height }, deviceScaleFactor: d.dsf, reducedMotion, colorScheme: 'light', locale: 'es-MX', timezoneId: 'America/Mazatlan' })
  if (init) await ctx.addInitScript(init)
  const page = await ctx.newPage()
  const ev = { console: [], pageErrors: [], http: [], failed: [] }
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') ev.console.push(`${m.type()}: ${m.text().replace(/apikey=[^&\s]+/g, 'apikey=…').slice(0, 220)}`)
  })
  page.on('pageerror', (e) => ev.pageErrors.push(String(e.message).slice(0, 300)))
  page.on('response', (r) => {
    try {
      const u = new URL(r.url())
      if (u.hostname === '127.0.0.1') {
        if (r.status() >= 400) ev.http.push(`${r.status()} ${r.request().method()} ${u.pathname}`)
        return
      }
      ev.http.push(`${r.status()} ${r.request().method()} ${u.hostname.endsWith('supabase.co') ? 'supabase' : u.hostname}${u.pathname}`)
    } catch {
      /* ignore */
    }
  })
  page.on('requestfailed', (r) => {
    const f = r.failure()?.errorText ?? ''
    if (/ERR_ABORTED/.test(f)) return
    ev.failed.push(`${r.url().split('?')[0]} ${f}`)
  })
  page._ev = ev
  return page
}

export function resetEv(page) {
  const ev = page._ev
  ev.console.length = 0
  ev.pageErrors.length = 0
  ev.http.length = 0
  ev.failed.length = 0
}

export async function settle(page, extra = 600) {
  await page.evaluate(() => document.fonts.ready).catch(() => undefined)
  // Lazy screens show a skeleton Spinner (role=status, class *loading*) first; wait for it to go (max 8 s).
  const deadline = Date.now() + 8000
  while (Date.now() < deadline) {
    const loading = await page.evaluate(() => [...document.querySelectorAll('[role=status]')].some((el) => /loading/i.test(String(el.className)) && el.getBoundingClientRect().height > 0)).catch(() => false)
    if (!loading) break
    await page.waitForTimeout(200)
  }
  await page.waitForTimeout(extra)
}

export async function go(page, url, { extra = 600 } = {}) {
  resetEv(page)
  await page.goto(BASE + url, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => (document.querySelector('main')?.innerText ?? document.body.innerText).trim().length > 5, null, { timeout: 15000 }).catch(() => undefined)
  await settle(page, extra)
}

/** In-page analysis. `scope`: 'viewport' (only what's on screen) or 'page' (whole document). */
export async function analyze(page, { scope = 'viewport', root = null } = {}) {
  return page.evaluate(
    ({ scope, root }) => {
      const vw = innerWidth
      const vh = innerHeight
      const de = document.documentElement
      const res = { vw, vh, scrollW: de.scrollWidth, scrollH: de.scrollHeight }
      const csCache = new Map()
      const cs = (el) => {
        let s = csCache.get(el)
        if (!s) {
          s = getComputedStyle(el)
          csCache.set(el, s)
        }
        return s
      }
      const cls = (el) =>
        String(el.className?.baseVal ?? el.className ?? '')
          .split(/\s+/)
          .filter(Boolean)
          .map((c) => c.replace(/^_?([A-Za-z][A-Za-z0-9-]*?)_[A-Za-z0-9]{5}(_\d+)?$/, '$1'))
          .slice(0, 2)
          .join('.')
      const desc = (el) => `${el.tagName.toLowerCase()}${cls(el) ? '.' + cls(el) : ''}`
      const visible = (el) => {
        for (let e = el; e && e !== document.body; e = e.parentElement) {
          const s = cs(e)
          if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false
        }
        return true
      }
      const inView = (r) => r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw
      const base = root ? document.querySelector(root) ?? document.body : document.body

      // Horizontal overflow of the document itself.
      res.hOverflow = de.scrollWidth > vw + 1
      res.hOffenders = []
      if (res.hOverflow) {
        for (const el of base.querySelectorAll('*')) {
          const r = el.getBoundingClientRect()
          if (r.width > 0 && r.right > vw + 1) {
            // Skip elements inside a horizontally scrolling/clipping ancestor.
            let clipped = false
            for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
              const o = cs(a).overflowX
              if (o !== 'visible') {
                clipped = true
                break
              }
            }
            if (!clipped) res.hOffenders.push(`${desc(el)} right=${Math.round(r.right)}`)
            if (res.hOffenders.length >= 6) break
          }
        }
      }
      // Horizontal scrollers (legit or not): containers that scroll sideways.
      res.hScrollers = []
      for (const el of base.querySelectorAll('*')) {
        const s = cs(el)
        if ((s.overflowX === 'auto' || s.overflowX === 'scroll') && el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0) {
          res.hScrollers.push(`${desc(el)} (${el.clientWidth}px shows ${el.scrollWidth}px${s.scrollbarWidth === 'none' ? ', hidden scrollbar' : ''})`)
          if (res.hScrollers.length >= 6) break
        }
      }

      // Text nodes.
      const walker = document.createTreeWalker(base, NodeFilter.SHOW_TEXT, {
        acceptNode: (n) => (n.nodeValue.trim() && n.parentElement && !/^(SCRIPT|STYLE|NOSCRIPT|TITLE|OPTION)$/.test(n.parentElement.tagName) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
      })
      const texts = []
      const range = document.createRange()
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const el = n.parentElement
        if (!visible(el)) continue
        range.selectNodeContents(n)
        const r = range.getBoundingClientRect()
        if (r.width < 1 || r.height < 1) continue
        // sr-only: clipped to 1px.
        const s = cs(el)
        if (s.position === 'absolute' && (parseFloat(s.width) <= 1 || s.clip === 'rect(0px, 0px, 0px, 0px)')) continue
        if (scope === 'viewport' && !inView(r)) continue
        texts.push({ n, el, r, rects: [...range.getClientRects()].filter((x) => x.width > 0.5 && x.height > 0.5), fs: parseFloat(s.fontSize), text: n.nodeValue.trim().replace(/\s+/g, ' ') })
      }
      res.textNodes = texts.length

      // Font sizes.
      const hist = { '<12': 0, '12-13.9': 0, '14-15.9': 0, '16-23.9': 0, '24-31.9': 0, '>=32': 0 }
      for (const t of texts) {
        const f = t.fs
        hist[f < 12 ? '<12' : f < 14 ? '12-13.9' : f < 16 ? '14-15.9' : f < 24 ? '16-23.9' : f < 32 ? '24-31.9' : '>=32']++
      }
      res.fontHist = hist
      const sorted = [...texts].sort((a, b) => a.fs - b.fs)
      res.minFont = sorted[0] ? { px: Math.round(sorted[0].fs * 10) / 10, samples: [...new Set(sorted.filter((t) => t.fs === sorted[0].fs).map((t) => `"${t.text.slice(0, 40)}" (${desc(t.el)})`))].slice(0, 4) } : null
      res.maxFont = sorted.length ? Math.round(sorted[sorted.length - 1].fs * 10) / 10 : null

      // Clipped text: text extending past the nearest clipping ancestor (overflow hidden/clip), or past the viewport sideways.
      res.clipped = []
      let clippedCount = 0
      for (const t of texts) {
        let clipper = null
        for (let a = t.el; a && a !== document.documentElement; a = a.parentElement) {
          const s = cs(a)
          if (/(hidden|clip)/.test(s.overflowX) || /(hidden|clip)/.test(s.overflowY)) {
            clipper = a
            break
          }
          if (/(auto|scroll)/.test(s.overflowX) || /(auto|scroll)/.test(s.overflowY)) break
        }
        let cut = 0
        let how = ''
        if (clipper) {
          const c = clipper.getBoundingClientRect()
          const s = cs(clipper)
          const dx = Math.max(0, t.r.right - c.right, c.left - t.r.left)
          const dy = Math.max(0, t.r.bottom - c.bottom, c.top - t.r.top)
          if (dx > 2 && /(hidden|clip)/.test(s.overflowX)) {
            cut = dx
            how = cs(t.el).textOverflow === 'ellipsis' || s.textOverflow === 'ellipsis' ? 'ellipsis' : 'cut-x'
          } else if (dy > 2 && /(hidden|clip)/.test(s.overflowY)) {
            cut = dy
            how = 'cut-y'
          }
        } else if (t.r.right > vw + 2 && !res.hOverflow) {
          // Text beyond the viewport with no clipper: off-screen.
          cut = t.r.right - vw
          how = 'offscreen-x'
        }
        if (cut > 2) {
          clippedCount++
          if (res.clipped.length < 8) res.clipped.push(`${how} ${Math.round(cut)}px "${t.text.slice(0, 48)}" in ${desc(clipper ?? t.el)}`)
        }
      }
      res.clippedCount = clippedCount

      // Overlapping text (different nodes, line boxes intersecting noticeably).
      res.overlaps = []
      let overlapCount = 0
      const lim = Math.min(texts.length, 1500)
      for (let i = 0; i < lim; i++) {
        const A = texts[i]
        for (let j = i + 1; j < lim; j++) {
          const B = texts[j]
          if (A.el === B.el) continue
          // Quick reject on union rects.
          if (A.r.right <= B.r.left || B.r.right <= A.r.left || A.r.bottom <= B.r.top || B.r.bottom <= A.r.top) continue
          let hit = false
          for (const ra of A.rects) {
            for (const rb of B.rects) {
              const w = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left)
              const h = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top)
              if (w > 2 && h > 2 && w * h > 0.25 * Math.min(ra.width * ra.height, rb.width * rb.height)) hit = true
            }
          }
          if (hit) {
            overlapCount++
            if (res.overlaps.length < 6) res.overlaps.push(`"${A.text.slice(0, 30)}" (${desc(A.el)}) x "${B.text.slice(0, 30)}" (${desc(B.el)})`)
          }
        }
      }
      res.overlapCount = overlapCount

      // Tap targets under 44×44 CSS px (reported, most useful on phones).
      res.smallTaps = []
      let smallCount = 0
      let tapCount = 0
      for (const el of base.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea, summary, [role=button], [role=tab], [role=radio], [role=switch], [role=checkbox]')) {
        if (!visible(el)) continue
        const r = el.getBoundingClientRect()
        if (r.width < 1 || r.height < 1) continue
        if (scope === 'viewport' && !inView(r)) continue
        tapCount++
        if (r.width < 44 || r.height < 44) {
          smallCount++
          if (res.smallTaps.length < 5) res.smallTaps.push(`${desc(el)} "${(el.innerText || el.getAttribute('aria-label') || el.value || '').trim().slice(0, 24)}" ${Math.round(r.width)}×${Math.round(r.height)}`)
        }
      }
      res.tapCount = tapCount
      res.smallTapCount = smallCount

      // Suspicious text.
      const body = (document.querySelector('main') ?? document.body).innerText
      res.textLen = body.trim().length
      const pats = [
        [/\bundefined\b/, 'undefined'],
        [/\bNaN\b/, 'NaN'],
        [/\bnull\b/, 'null'],
        [/\[object Object\]/, '[object Object]'],
        [/Invalid Date/, 'Invalid Date'],
        [/permission denied|violates|invalid input syntax|JWT|PGRST|Failed to fetch|NetworkError|TypeError|Bad Request|Unauthorized/i, 'raw-error'],
        [/Algo salió mal/, 'error-box'],
        [/Algo falló al abrir Polo/, 'crash-screen'],
        [/No tienes permiso para ver esto/, 'forbidden'],
        [/Este juego no está activo en este torneo/, 'module-off-placeholder'],
        [/\bTODO\b|FIXME|[Ll]orem ipsum/, 'todo/lorem'],
      ]
      res.flags = []
      for (const [re, name] of pats) {
        const m = body.match(re)
        if (m) {
          const i = m.index ?? 0
          res.flags.push(`${name}: "${body.slice(Math.max(0, i - 30), i + 50).replace(/\s+/g, ' ').trim()}"`)
        }
      }
      // A name that fell back to "?" renders as its own text node "?" outside any button.
      const lone = texts.filter((t) => t.text === '?' && !t.el.closest('button'))
      if (lone.length) res.flags.push(`lone-? ×${lone.length} (unknown name/value rendered as "?"), e.g. in ${desc(lone[0].el)} near "${(lone[0].el.parentElement?.innerText ?? '').replace(/\s+/g, ' ').slice(0, 60)}"`)
      res.h1 = document.querySelector('h1')?.innerText?.slice(0, 80) ?? null
      res.h2 = [...document.querySelectorAll('main h2')].map((h) => h.innerText.trim()).filter(Boolean).slice(0, 4)
      return res
    },
    { scope, root },
  )
}

/** Human-readable observations from an analysis + the page's network/console log. */
export function autoObs(a, ev, { device, full = false } = {}) {
  const o = []
  if (ev.pageErrors.length) o.push(`PAGE ERROR: ${ev.pageErrors.join(' | ')}`)
  const cons = ev.console.filter((c) => !/Failed to load resource/.test(c))
  if (cons.length) o.push(`console: ${cons.slice(0, 3).join(' | ')}`)
  const bad = ev.http.filter((h) => /^[45]\d\d /.test(h))
  if (bad.length) o.push(`HTTP errors: ${[...new Set(bad)].join('; ')}`)
  if (ev.failed.length) o.push(`failed requests: ${[...new Set(ev.failed)].slice(0, 3).join('; ')}`)
  if (a.textLen < 20) o.push(`BLANK/near-blank screen (main text ${a.textLen} chars)`)
  for (const f of a.flags) o.push(`text flag ${f}`)
  if (a.hOverflow) o.push(`HORIZONTAL OVERFLOW: page ${a.scrollW}px wide at ${a.vw}px viewport; ${a.hOffenders.join(', ')}`)
  if (a.hScrollers.length) o.push(`sideways scrollers: ${a.hScrollers.join('; ')}`)
  if (a.clippedCount) o.push(`clipped text ×${a.clippedCount}: ${a.clipped.slice(0, 4).join('; ')}`)
  if (a.overlapCount) o.push(`overlapping text ×${a.overlapCount}: ${a.overlaps.slice(0, 3).join('; ')}`)
  if (a.minFont) o.push(`min font ${a.minFont.px}px (${a.minFont.samples.slice(0, 2).join(', ')}); max ${a.maxFont}px`)
  if (device === '15pro' && a.smallTapCount) o.push(`tap targets <44px: ${a.smallTapCount}/${a.tapCount} (${a.smallTaps.slice(0, 3).join('; ')})`)
  if (full && a.scrollH > MAX_H) o.push(`page is ${a.scrollH}px tall; shot capped at ${MAX_H}px`)
  return o
}

export async function shoot(page, file, { full = false } = {}) {
  const vp = page.viewportSize()
  if (full) {
    const h = await page.evaluate(() => document.documentElement.scrollHeight)
    await page.screenshot({ path: path.join(OUT, file), fullPage: true, clip: { x: 0, y: 0, width: vp.width, height: Math.min(h, MAX_H) } })
  } else {
    await page.screenshot({ path: path.join(OUT, file) })
  }
}

/** Screenshot + analysis + record. */
export async function capture(page, rec, { full = false, scope, root, extraObs = [] } = {}) {
  await shoot(page, rec.file, { full })
  const a = await analyze(page, { scope: scope ?? (full ? 'page' : 'viewport'), root })
  const obs = [...extraObs, ...autoObs(a, page._ev, { device: rec.device, full })]
  const r = { ...rec, url: rec.url, observations: obs, metrics: a, network: [...new Set(page._ev.http)] }
  console.log(`  ${rec.file}  ${obs.filter((x) => !/^min font/.test(x)).slice(0, 2).join(' || ').slice(0, 160)}`)
  return r
}

export function saveRecords(phase, records) {
  writeFileSync(`${EV}/records/${phase}.json`, JSON.stringify(records, null, 2))
}
export function loadRecords(phase) {
  const f = `${EV}/records/${phase}.json`
  return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : []
}
