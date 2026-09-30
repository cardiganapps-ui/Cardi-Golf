// In-page analysis for one screenshot. Passed to page.evaluate(); must be self-contained.
// Returns { obs: string[], metrics: {...} }. Nothing here changes the page except
// scrolling (reachability pass), which the caller runs after the screenshot.

export function analyzeStatic({ scopeSel, full, capH }) {
  const iw = innerWidth
  const vh = innerHeight
  const se = document.scrollingElement
  const obs = []
  const metrics = {}
  const short = (s, n = 60) => {
    s = String(s ?? '').replace(/\s+/g, ' ').trim()
    return s.length > n ? s.slice(0, n - 1) + '…' : s
  }
  const cls = (el) =>
    [...(el.classList || [])]
      .map((c) => {
        const m = c.match(/^_(.+)_[a-z0-9]{5}_\d+$/)
        return m ? m[1] : c
      })
      .filter(Boolean)
  const desc = (el) => {
    if (!el || el.nodeType !== 1) return '?'
    const c = cls(el).slice(0, 2).join('.')
    const role = el.getAttribute('role')
    return el.tagName.toLowerCase() + (c ? '.' + c : '') + (role ? `[role=${role}]` : '')
  }
  const visCache = new Map()
  const visibleDeep = (el) => {
    if (!el || el.nodeType !== 1) return true
    if (visCache.has(el)) return visCache.get(el)
    const cs = getComputedStyle(el)
    let v = cs.display !== 'none' && cs.visibility !== 'hidden' && cs.visibility !== 'collapse' && Number(cs.opacity) > 0.02
    if (v && el.parentElement) v = visibleDeep(el.parentElement)
    visCache.set(el, v)
    return v
  }
  const isSrOnly = (el) => {
    for (let a = el; a && a !== document.body; a = a.parentElement) {
      const r = a.getBoundingClientRect()
      const cs = getComputedStyle(a)
      if ((r.width <= 1.5 || r.height <= 1.5) && (cs.position === 'absolute' || cs.overflow === 'hidden')) return true
      if (cs.clip && cs.clip !== 'auto' && cs.position === 'absolute') return true
      if (cs.clipPath && cs.clipPath.startsWith('inset(50%')) return true
    }
    return false
  }
  // Nearest fixed/sticky container (content under a fixed bar is by design, not an overlap).
  const layerCache = new Map()
  const layerOf = (el) => {
    if (!el || el === document.body || el === document.documentElement) return null
    if (layerCache.has(el)) return layerCache.get(el)
    const pos = getComputedStyle(el).position
    const v = pos === 'fixed' || pos === 'sticky' ? el : layerOf(el.parentElement)
    layerCache.set(el, v)
    return v
  }
  // Visible box of an element after every clipping ancestor.
  const clipCache = new Map()
  const clipBox = (el) => {
    if (!el || el === document.documentElement) return { left: -1e9, top: -1e9, right: 1e9, bottom: 1e9 }
    if (clipCache.has(el)) return clipCache.get(el)
    const parent = clipBox(el.parentElement)
    const cs = getComputedStyle(el)
    let box = parent
    if (el !== document.body && (cs.overflowX !== 'visible' || cs.overflowY !== 'visible')) {
      const r = el.getBoundingClientRect()
      box = {
        left: cs.overflowX !== 'visible' ? Math.max(parent.left, r.left) : parent.left,
        right: cs.overflowX !== 'visible' ? Math.min(parent.right, r.right) : parent.right,
        top: cs.overflowY !== 'visible' ? Math.max(parent.top, r.top) : parent.top,
        bottom: cs.overflowY !== 'visible' ? Math.min(parent.bottom, r.bottom) : parent.bottom,
      }
    }
    clipCache.set(el, box)
    return box
  }

  const dialogs = [...document.querySelectorAll('[role=dialog]')].filter((d) => visibleDeep(d))
  const scope = (scopeSel && [...document.querySelectorAll(scopeSel)].filter((d) => visibleDeep(d)).pop()) || dialogs.at(-1) || document.body
  metrics.scope = scope === document.body ? 'page' : desc(scope)
  metrics.title = document.title
  metrics.h1 = [...document.querySelectorAll('h1')].filter(visibleDeep).map((h) => short(h.textContent, 50))
  metrics.dialogs = dialogs.map((d) => short(d.getAttribute('aria-label'), 40))

  // ---- crash / not found / blank / loading ----
  const bootAlert = document.querySelector('main[role=alert]')
  if (bootAlert) obs.push(`ERROR BOUNDARY (BootProblem): "${short(bootAlert.querySelector('h1')?.textContent)}"`)
  const bodyText = (document.body.innerText || '').trim()
  if (/Esta página no existe|Ese torneo no existe|Ese torneo ya no existe/.test(bodyText)) obs.push('NOT-FOUND screen rendered')
  const mainText = ((document.querySelector('main') || document.body).innerText || '').trim()
  if (mainText.length < 40) obs.push(`BLANK/near-empty main (${mainText.length} chars: "${short(mainText, 80)}")`)
  const loading = [...document.querySelectorAll('div[role=status][class*="loading"]')].filter(visibleDeep)
  if (loading.length) obs.push(`loading skeleton still visible after settle (${loading.length})`)
  const broken = [...document.images].filter((i) => visibleDeep(i) && i.complete && i.naturalWidth === 0)
  if (broken.length) obs.push(`broken image(s): ${broken.map((i) => short(i.getAttribute('src'), 60)).join(', ')}`)
  metrics.fontsOk = document.fonts.check('16px "Archivo Variable"')
  if (!metrics.fontsOk) obs.push('text font (Archivo Variable) not loaded: fallback font rendered')

  // ---- horizontal overflow ----
  metrics.scrollWidth = se.scrollWidth
  metrics.innerWidth = iw
  metrics.scrollHeight = se.scrollHeight
  metrics.viewportHeight = vh
  if (se.scrollWidth > iw + 0.5) obs.push(`HORIZONTAL OVERFLOW: page scrollWidth ${se.scrollWidth}px > viewport ${iw}px (sideways scroll/wobble)`)
  const all = [...scope.querySelectorAll('*')].filter((el) => !(el instanceof SVGElement && el.tagName.toLowerCase() !== 'svg'))
  const offenders = []
  const scrollers = new Map()
  const clippedWide = []
  const reported = new Set()
  for (const el of all) {
    if (!visibleDeep(el)) continue
    const r = el.getBoundingClientRect()
    if (r.width < 2 || r.height < 2) continue
    if (r.right <= iw + 1 && r.left >= -1) continue
    if (isSrOnly(el)) continue
    let anc = null
    for (let a = el.parentElement; a && a !== document.documentElement; a = a.parentElement) {
      const cs = getComputedStyle(a)
      if (cs.overflowX !== 'visible') {
        anc = { a, cs }
        break
      }
    }
    let skip = false
    for (let a = el.parentElement; a; a = a.parentElement) if (reported.has(a)) skip = true
    if (skip) continue
    if (anc && anc.a !== document.body) {
      const ar = anc.a.getBoundingClientRect()
      if (ar.right <= iw + 1 && ar.left >= -1) {
        if (anc.cs.overflowX === 'auto' || anc.cs.overflowX === 'scroll') {
          if (!scrollers.has(anc.a)) scrollers.set(anc.a, { el: anc.a, sw: anc.a.scrollWidth, cw: anc.a.clientWidth })
        } else {
          // Clipped horizontally and not scrollable: only report if it is not simply a truncating text box.
          const cs2 = getComputedStyle(anc.a)
          if (cs2.textOverflow !== 'ellipsis') clippedWide.push(`${desc(el)} "${short(el.innerText, 40)}" runs to x=${Math.round(r.right)} inside ${desc(anc.a)} (overflow-x:${anc.cs.overflowX}, right edge ${Math.round(ar.right)})`)
        }
        reported.add(el)
        continue
      }
    }
    offenders.push(`${desc(el)} "${short(el.innerText || el.getAttribute('aria-label'), 40)}" spans x=${Math.round(r.left)}..${Math.round(r.right)} (viewport ${iw})`)
    reported.add(el)
  }
  if (offenders.length) obs.push(`element(s) past the viewport edge${se.scrollWidth > iw + 0.5 ? '' : ' (page does not scroll sideways, so this part is cut off)'}: ${offenders.slice(0, 5).join('; ')}${offenders.length > 5 ? ` (+${offenders.length - 5} more)` : ''}`)
  if (clippedWide.length) obs.push(`content clipped by a non-scrolling container: ${clippedWide.slice(0, 4).join('; ')}${clippedWide.length > 4 ? ` (+${clippedWide.length - 4} more)` : ''}`)
  metrics.hScrollers = [...scrollers.values()].map((s) => `${desc(s.el)} ${s.sw}/${s.cw}px`)

  // ---- truncated / clipped text ----
  const truncated = []
  const clamped = []
  const cut = []
  const spill = []
  const ownText = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())
  const inRegion = (r) => full || (r.bottom > 0 && r.top < vh)
  for (const el of all) {
    if (!visibleDeep(el)) continue
    const r = el.getBoundingClientRect()
    if (r.width < 2 || r.height < 2 || !inRegion(r)) continue
    const cs = getComputedStyle(el)
    const text = (el.innerText || '').trim()
    if (!text) continue
    const hid = cs.overflowX === 'hidden' || cs.overflowX === 'clip'
    if (cs.textOverflow === 'ellipsis' && hid && el.scrollWidth > el.clientWidth + 1) {
      truncated.push(`"${short(text, 70)}" (${desc(el)}, ${el.clientWidth}px shown of ${el.scrollWidth}px)`)
    } else if (cs.webkitLineClamp && cs.webkitLineClamp !== 'none' && el.scrollHeight > el.clientHeight + 1) {
      clamped.push(`"${short(text, 70)}" (${desc(el)}, clamped to ${cs.webkitLineClamp} line(s))`)
    } else if (hid && el.scrollWidth > el.clientWidth + 2 && ownText(el)) {
      cut.push(`"${short(text, 60)}" (${desc(el)}, ${el.clientWidth}px box, content ${el.scrollWidth}px, no ellipsis)`)
    } else if ((cs.overflowY === 'hidden' || cs.overflowY === 'clip') && el.scrollHeight > el.clientHeight + 3 && ownText(el) && !isSrOnly(el)) {
      cut.push(`"${short(text, 60)}" (${desc(el)}, cut vertically: ${el.clientHeight}px box, content ${el.scrollHeight}px)`)
    } else if (cs.overflowX === 'visible' && cs.display !== 'inline' && el.scrollWidth > el.clientWidth + 2 && ownText(el) && el.clientWidth > 0) {
      spill.push(`"${short(text, 60)}" (${desc(el)}, text ${el.scrollWidth}px in a ${el.clientWidth}px box)`)
    }
  }
  const uniq = (a) => [...new Set(a)]
  if (truncated.length) obs.push(`text truncated with ellipsis (${uniq(truncated).length}): ${uniq(truncated).slice(0, 6).join('; ')}${uniq(truncated).length > 6 ? ` (+${uniq(truncated).length - 6} more)` : ''}`)
  if (clamped.length) obs.push(`text line-clamped (${uniq(clamped).length}): ${uniq(clamped).slice(0, 4).join('; ')}`)
  if (cut.length) obs.push(`text cut off without ellipsis (${uniq(cut).length}): ${uniq(cut).slice(0, 4).join('; ')}`)
  if (spill.length) obs.push(`text wider than its box, spilling out (${uniq(spill).length}): ${uniq(spill).slice(0, 4).join('; ')}`)

  // ---- overlapping text (glyph boxes of different elements intersecting) ----
  const texts = []
  const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.textContent.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT) })
  for (let n; (n = walker.nextNode()); ) {
    const el = n.parentElement
    if (!el || !visibleDeep(el) || isSrOnly(el)) continue
    const range = document.createRange()
    range.selectNodeContents(n)
    const cb = clipBox(el)
    for (const r0 of range.getClientRects()) {
      const r = { left: Math.max(r0.left, cb.left), right: Math.min(r0.right, cb.right), top: Math.max(r0.top, cb.top), bottom: Math.min(r0.bottom, cb.bottom) }
      if (r.right - r.left < 2 || r.bottom - r.top < 2) continue
      if (!full && (r.bottom < 0 || r.top > vh)) continue
      texts.push({ r, el, layer: layerOf(el), text: n.textContent })
    }
  }
  texts.sort((a, b) => a.r.top - b.r.top)
  const overlaps = []
  const seenPair = new Set()
  for (let i = 0; i < texts.length; i++) {
    const a = texts[i]
    for (let j = i + 1; j < texts.length; j++) {
      const b = texts[j]
      if (b.r.top >= a.r.bottom) break
      if (a.el === b.el || a.layer !== b.layer || a.el.contains(b.el) || b.el.contains(a.el)) continue
      const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left)
      const h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top)
      const minH = Math.min(a.r.bottom - a.r.top, b.r.bottom - b.r.top)
      if (w > 3 && h > Math.max(3, 0.35 * minH)) {
        const key = [a.el, b.el].map(desc).join('|') + short(a.text, 20) + short(b.text, 20)
        if (seenPair.has(key)) continue
        seenPair.add(key)
        overlaps.push(`"${short(a.text, 30)}" (${desc(a.el)}) × "${short(b.text, 30)}" (${desc(b.el)}) at y≈${Math.round(Math.max(a.r.top, b.r.top) + (scope === document.body ? scrollY : 0))}, ${Math.round(w)}×${Math.round(h)}px`)
      }
    }
  }
  if (overlaps.length) obs.push(`OVERLAPPING TEXT (${overlaps.length}): ${overlaps.slice(0, 5).join('; ')}${overlaps.length > 5 ? ` (+${overlaps.length - 5} more)` : ''}`)

  // ---- tap targets and tiny text (metrics only) ----
  const interactive = all.filter((el) => el.matches('button, a[href], input, select, textarea, [role=button], [role=tab], [role=radio], [role=switch], summary') && visibleDeep(el))
  const small = []
  for (const el of interactive) {
    const r = el.getBoundingClientRect()
    if (r.width < 1 || r.height < 1 || !inRegion(r)) continue
    if (r.height < 44 || r.width < 44) small.push(`${desc(el)} "${short(el.innerText || el.getAttribute('aria-label'), 24)}" ${Math.round(r.width)}×${Math.round(r.height)}`)
  }
  metrics.interactive = interactive.length
  metrics.smallTargets = small.length
  metrics.smallTargetExamples = uniq(small).slice(0, 5)
  let tiny = 0
  const tinyEx = []
  for (const t of texts) {
    const fs = parseFloat(getComputedStyle(t.el).fontSize)
    if (fs < 12) {
      tiny++
      if (tinyEx.length < 3) tinyEx.push(`"${short(t.text, 24)}" ${fs}px`)
    }
  }
  metrics.textRuns = texts.length
  metrics.textUnder12px = tiny
  metrics.textUnder12pxExamples = uniq(tinyEx)
  return { obs, metrics }
}

/**
 * Reachability: scroll each interactive element (in scope) to the centre and
 * check the point is really it; at the end, check the last content clears the
 * fixed bottom bar at max scroll. Scrolls the page: run after the screenshot.
 */
export function analyzeReach({ scopeSel }) {
  const iw = innerWidth
  const vh = innerHeight
  const obs = []
  const short = (s, n = 40) => {
    s = String(s ?? '').replace(/\s+/g, ' ').trim()
    return s.length > n ? s.slice(0, n - 1) + '…' : s
  }
  const cls = (el) => [...(el.classList || [])].map((c) => (c.match(/^_(.+)_[a-z0-9]{5}_\d+$/) || [])[1] || c)
  const desc = (el) => (el && el.nodeType === 1 ? el.tagName.toLowerCase() + (cls(el).length ? '.' + cls(el).slice(0, 2).join('.') : '') : '?')
  const visible = (el) => {
    for (let a = el; a && a.nodeType === 1; a = a.parentElement) {
      const cs = getComputedStyle(a)
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) <= 0.02) return false
    }
    const r = el.getBoundingClientRect()
    return r.width > 1 && r.height > 1
  }
  const dialogs = [...document.querySelectorAll('[role=dialog]')].filter(visible)
  const scope = (scopeSel && [...document.querySelectorAll(scopeSel)].filter(visible).pop()) || dialogs.at(-1) || document.body
  // Fixed bars anchored to the bottom (tab bar, save bar): their top edge.
  const fixedBottom = [...document.querySelectorAll('body *')].filter((el) => {
    const cs = getComputedStyle(el)
    if (cs.position !== 'fixed' || !visible(el)) return false
    const r = el.getBoundingClientRect()
    return r.bottom >= vh - 2 && r.top > vh / 2 && r.width > iw * 0.6 && !el.closest('[role=dialog]') && !el.matches('[role=status]')
  })
  const barTop = fixedBottom.length ? Math.min(...fixedBottom.map((el) => el.getBoundingClientRect().top)) : vh
  const covered = []
  const offX = []
  const els = [...scope.querySelectorAll('button, a[href], input, select, textarea, [role=button], [role=tab], [role=radio]')].filter(visible).slice(0, 160)
  for (const el of els) {
    if (el.disabled) continue
    el.scrollIntoView({ block: 'center', inline: 'nearest' })
    const r = el.getBoundingClientRect()
    const cx = Math.min(Math.max(r.left + r.width / 2, 0), iw - 1)
    const cy = r.top + r.height / 2
    if (r.left + r.width / 2 < 0 || r.left + r.width / 2 > iw) {
      offX.push(`${desc(el)} "${short(el.innerText || el.getAttribute('aria-label'))}" at x=${Math.round(r.left)}`)
      continue
    }
    if (cy < 0 || cy > vh) {
      covered.push(`${desc(el)} "${short(el.innerText || el.getAttribute('aria-label'))}" cannot be scrolled into view (centre y=${Math.round(cy)})`)
      continue
    }
    const hit = document.elementFromPoint(cx, cy)
    if (!hit || el === hit || el.contains(hit)) continue
    if (hit.contains(el)) continue // pointer-events:none child; the click still lands on an ancestor
    covered.push(`${desc(el)} "${short(el.innerText || el.getAttribute('aria-label'))}" is under ${desc(hit)} "${short(hit.innerText, 20)}"`)
  }
  if (covered.length) obs.push(`UNREACHABLE/COVERED control(s) (${covered.length}): ${covered.slice(0, 4).join('; ')}${covered.length > 4 ? ` (+${covered.length - 4} more)` : ''}`)
  if (offX.length) obs.push(`control(s) outside the viewport horizontally (${offX.length}): ${offX.slice(0, 4).join('; ')}`)
  // Last content vs the fixed bottom bar at max scroll (page scope only).
  let hiddenTail = null
  if (scope === document.body && fixedBottom.length) {
    window.scrollTo(0, document.scrollingElement.scrollHeight)
    const main = document.querySelector('main') || document.body
    let maxBottom = 0
    let lastEl = null
    const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.textContent.trim() ? 1 : 2) })
    for (let n; (n = walker.nextNode()); ) {
      const el = n.parentElement
      if (!el || !visible(el) || fixedBottom.some((f) => f.contains(el))) continue
      const pos = getComputedStyle(el).position
      if (pos === 'fixed') continue
      const range = document.createRange()
      range.selectNodeContents(n)
      for (const r of range.getClientRects()) if (r.bottom > maxBottom && r.width > 1) {
        maxBottom = r.bottom
        lastEl = { el, text: n.textContent }
      }
    }
    if (lastEl && maxBottom > barTop + 2) hiddenTail = `last content "${short(lastEl.text)}" (${desc(lastEl.el)}) ends at y=${Math.round(maxBottom)} but the fixed bar starts at y=${Math.round(barTop)}: ${Math.round(maxBottom - barTop)}px of it can never scroll clear of the bar`
    if (hiddenTail) obs.push(hiddenTail)
  }
  window.scrollTo(0, 0)
  for (const d of dialogs) d.scrollTop = 0
  return { obs, barHeight: Math.round(vh - barTop) }
}
