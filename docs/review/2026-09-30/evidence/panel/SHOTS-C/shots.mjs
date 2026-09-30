// SHOTS-C: canonical screenshots outside a tournament (home, organizer, Entrar, legal, 404,
// profile/social fixtures, Admin de Polo fixture, fixture index, two production screens).
// Usage: SECTIONS=local,wizard,profile,admin,prod node shots.mjs   (default: all but prod)
import { chromium } from 'playwright-core'
import fs from 'node:fs'
import path from 'node:path'

const S = '/tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad'
const HERE = `${S}/panel/evidence/SHOTS-C`
const OUT = '/home/user/Cardi-Golf/docs/review/2026-09-30/shots'
const BASE = 'http://127.0.0.1:4173'
const PROD = 'https://golf.cardigan.mx'
const FULL_CAP = 3200
const DEVICES = {
  '15pro': { width: 393, height: 852, dsf: 2, mobile: true },
  se: { width: 375, height: 667, dsf: 2, mobile: true },
  laptop: { width: 1440, height: 900, dsf: 1, mobile: false },
}
const SECTIONS = (process.env.SECTIONS ?? 'local,wizard,profile,admin').split(',')
const RAW = `${HERE}/raw-${SECTIONS.join('+')}.json`

fs.mkdirSync(OUT, { recursive: true })

// Files this agent wrote before (so a rerun may overwrite its own files, never someone else's).
const mine = new Set()
for (const f of fs.readdirSync(HERE).filter((f) => f.startsWith('raw-') && f.endsWith('.json'))) {
  try {
    for (const r of JSON.parse(fs.readFileSync(path.join(HERE, f), 'utf8'))) mine.add(r.file)
  } catch {}
}

const results = []
const save = () => fs.writeFileSync(RAW, JSON.stringify(results, null, 1))

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })

async function newCtx(device) {
  const d = DEVICES[device]
  const ctx = await browser.newContext({
    viewport: { width: d.width, height: d.height },
    deviceScaleFactor: d.dsf,
    isMobile: d.mobile,
    hasTouch: d.mobile,
    reducedMotion: 'reduce',
    colorScheme: 'light',
    locale: 'es-MX',
    timezoneId: 'America/Mexico_City',
  })
  const page = await ctx.newPage()
  page._buf = []
  page.on('pageerror', (e) => page._buf.push(`pageerror: ${String(e).slice(0, 200)}`))
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') page._buf.push(`console.${m.type()}: ${m.text().replace(/\s+/g, ' ').slice(0, 200)}`)
  })
  page.on('response', (r) => {
    if (r.status() >= 400) page._buf.push(`HTTP ${r.status()} ${r.request().method()} ${r.url().replace(/\?.*/, '').slice(0, 120)}`)
  })
  page.on('requestfailed', (r) => {
    const err = r.failure()?.errorText ?? ''
    if (!/ERR_ABORTED/.test(err)) page._buf.push(`requestfailed: ${r.url().replace(/\?.*/, '').slice(0, 120)} ${err}`)
  })
  page.setDefaultTimeout(15000)
  return { ctx, page, device }
}

async function settle(page, extra = 600) {
  await page.evaluate(() => document.fonts.ready).catch(() => {})
  await page
    .waitForFunction(() => !document.querySelector('[role="status"][aria-label="Cargando…"]'), null, { timeout: 12000 })
    .catch(() => {})
  await page.evaluate(() => document.fonts.ready).catch(() => {})
  await page.waitForTimeout(extra)
}

async function visit(page, url) {
  page._buf = []
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 })
  await settle(page)
}

/** In-page checks: overflow, clipped/covered text, tiny text, placeholders, blank, error screens. */
function analyze(viewportOnly) {
  const W = innerWidth
  const H = innerHeight
  const se = document.scrollingElement
  const out = { title: document.title, scrollW: se.scrollWidth, scrollH: se.scrollHeight, issues: [], notes: [] }
  const short = (s, n = 40) => (s || '').trim().replace(/\s+/g, ' ').slice(0, n)
  const desc = (el) => {
    let s = el.tagName.toLowerCase()
    const cls = [...el.classList].map((c) => c.replace(/^_([A-Za-z0-9]+)_[A-Za-z0-9-]+_\d+$/, '$1')).slice(0, 2)
    if (cls.length) s += '.' + cls.join('.')
    const txt = short(el.innerText || el.getAttribute('aria-label') || el.getAttribute('placeholder') || '', 36)
    return txt ? `${s} "${txt}"` : s
  }
  const vis = (el) => {
    const cs = getComputedStyle(el)
    return cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) > 0.05
  }
  const srOnly = (el, r) => {
    const cs = getComputedStyle(el)
    return (r.width <= 1 && r.height <= 1) || cs.clip === 'rect(0px, 0px, 0px, 0px)' || /inset\(50%\)/.test(cs.clipPath)
  }
  const body = document.body.innerText || ''

  // Blank / error screens / still loading
  if (body.trim().length < 40) out.issues.push(`near-blank page (${body.trim().length} chars of text)`)
  for (const s of ['Algo falló al abrir Polo', 'Polo está tardando en conectar', 'Algo salió mal']) if (body.includes(s)) out.issues.push(`error screen text: "${s}"`)
  if (document.querySelector('[role="status"][aria-label="Cargando…"]')) out.issues.push('loading skeleton still visible after settle')
  if (!document.querySelector('h1')) out.notes.push('no <h1> on the page')

  // Horizontal overflow and elements past the viewport edge
  if (se.scrollWidth > W + 1) out.issues.push(`horizontal overflow: document is ${se.scrollWidth}px wide in a ${W}px viewport`)
  const offenders = new Set()
  for (const el of document.body.querySelectorAll('*')) {
    const r = el.getBoundingClientRect()
    if (r.width < 1 || r.height < 1) continue
    if (r.right <= W + 1 && r.left >= -1) continue
    if (!vis(el) || srOnly(el, r)) continue
    let clipped = false
    let fixed = false
    for (let a = el; a && a !== document.body; a = a.parentElement) {
      const cs = getComputedStyle(a)
      if (a !== el && (cs.overflowX !== 'visible' || cs.overflowY !== 'visible')) {
        clipped = true
        break
      }
      if (cs.position === 'fixed') fixed = true
    }
    if (clipped) continue
    if (fixed && (r.left >= W || r.right <= 0)) continue
    offenders.add(el)
  }
  const outer = [...offenders].filter((el) => {
    for (let a = el.parentElement; a; a = a.parentElement) if (offenders.has(a)) return false
    return true
  })
  for (const el of outer.slice(0, 5)) {
    const r = el.getBoundingClientRect()
    out.issues.push(`past the viewport edge: ${desc(el)} spans x ${Math.round(r.left)}..${Math.round(r.right)} (viewport ${W})`)
  }

  // Text clipped by its own box (ellipsis / clamp) or spilling out of it
  const trunc = []
  const spill = []
  for (const el of document.body.querySelectorAll('*')) {
    if (!vis(el)) continue
    const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())
    if (!hasText) continue
    const r = el.getBoundingClientRect()
    if (r.width < 2 || srOnly(el, r)) continue
    if (viewportOnly && (r.bottom < 0 || r.top > H)) continue
    const cs = getComputedStyle(el)
    // An ellipsis kicks in on any overflow, even a sub-pixel one; plain clipping gets 1px of slack.
    const hx = el.clientWidth > 0 && el.scrollWidth > el.clientWidth + (cs.textOverflow === 'ellipsis' ? 0 : 1)
    const hy = el.clientHeight > 0 && el.scrollHeight > el.clientHeight + 2
    if (hx && cs.overflowX !== 'visible') trunc.push(`${desc(el)}${cs.textOverflow === 'ellipsis' ? ' (ellipsis)' : ' (cut)'}`)
    else if (hx && cs.display !== 'inline') spill.push(desc(el))
    if (hy && cs.overflowY !== 'visible' && cs.overflowY !== 'auto' && cs.overflowY !== 'scroll') trunc.push(`${desc(el)} (${cs.webkitLineClamp && cs.webkitLineClamp !== 'none' ? 'line-clamp' : 'cut vertically'})`)
  }
  // Form controls: the chosen option / typed value / placeholder wider than the box (a select also loses ~20px to its arrow).
  const ctx2d = document.createElement('canvas').getContext('2d')
  for (const el of document.querySelectorAll('select, input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=hidden]):not([type=date]):not([type=time]):not([type=datetime-local]):not([type=color]):not([type=file]), textarea')) {
    const r = el.getBoundingClientRect()
    if (r.width < 2 || !vis(el) || (viewportOnly && (r.bottom < 0 || r.top > H))) continue
    const cs = getComputedStyle(el)
    ctx2d.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
    const txt = el.tagName === 'SELECT' ? (el.options[el.selectedIndex]?.text ?? '') : el.value || el.placeholder || ''
    if (!txt || el.tagName === 'TEXTAREA') continue
    const room = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - (el.tagName === 'SELECT' ? 20 : 0)
    const w = ctx2d.measureText(txt).width
    if (w > room + 1) trunc.push(`${el.tagName.toLowerCase()} "${short(txt, 40)}" (${Math.round(w)}px of text in ${Math.round(room)}px: cut)`)
  }
  if (trunc.length) out.issues.push(`${trunc.length} truncated text box(es): ${trunc.slice(0, 4).join('; ')}`)
  if (spill.length) out.issues.push(`${spill.length} text box(es) wider than their container: ${spill.slice(0, 4).join('; ')}`)

  // Text covered by another element (viewport only) + tiny text
  const covered = []
  let underFixed = 0
  let underFixedEx = ''
  const tiny = []
  let minFont = 99
  // With a modal sheet open, only its own text counts (the page under the backdrop is dimmed on purpose).
  const modal = [...document.querySelectorAll('[role="dialog"][aria-modal="true"], [role="alertdialog"]')].find((d) => vis(d) && d.getBoundingClientRect().height > 0)
  if (modal) out.notes.push(`modal open: "${short(modal.getAttribute('aria-label') || modal.innerText, 40)}"`)
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  while (walker.nextNode()) {
    const n = walker.currentNode
    const txt = n.textContent.trim()
    if (!txt) continue
    const el = n.parentElement
    if (!el || !vis(el) || el.closest('[aria-hidden="true"], script, style, noscript')) continue
    if (modal && !modal.contains(el)) continue
    const range = document.createRange()
    range.selectNodeContents(n)
    const rects = [...range.getClientRects()].filter((r) => r.width >= 3 && r.height >= 3)
    if (!rects.length) continue
    const er = el.getBoundingClientRect()
    if (srOnly(el, er)) continue
    const fs = parseFloat(getComputedStyle(el).fontSize)
    const inView = rects.some((r) => r.bottom > 0 && r.top < H)
    if ((!viewportOnly || inView) && fs < 12) {
      tiny.push(`${fs}px "${short(txt, 24)}"`)
      minFont = Math.min(minFont, fs)
    }
    if (!viewportOnly) continue
    for (const r of rects) {
      if (r.top < 0 || r.bottom > H || r.left < 0 || r.right > W) continue
      const x = r.left + r.width / 2
      const y = r.top + r.height / 2
      const hit = document.elementFromPoint(x, y)
      if (!hit || hit === el || el.contains(hit) || hit.contains(el)) continue
      // A <label> wrapping both, or an input inside the same label, is fine.
      const common = hit.closest('label')
      if (common && common.contains(el)) continue
      let fixedBox = null
      for (let a = hit; a; a = a.parentElement) {
        const p = getComputedStyle(a).position
        if (p === 'fixed' || p === 'sticky') {
          fixedBox = a
          break
        }
      }
      if (fixedBox && !fixedBox.contains(el)) {
        underFixed++
        if (!underFixedEx) underFixedEx = `"${short(txt, 24)}" under ${desc(fixedBox).slice(0, 60)}`
        continue
      }
      covered.push(`"${short(txt, 28)}" covered by ${desc(hit).slice(0, 70)}`)
      break
    }
  }
  if (covered.length) out.issues.push(`${covered.length} text run(s) covered by another element: ${covered.slice(0, 4).join('; ')}`)
  if (underFixed) out.notes.push(`${underFixed} text run(s) sit under fixed/sticky chrome in this view (e.g. ${underFixedEx})`)
  if (tiny.length) out.notes.push(`${tiny.length} text run(s) under 12px (smallest ${minFont}px), e.g. ${[...new Set(tiny)].slice(0, 3).join(', ')}`)

  // Placeholder-looking content
  const pats = [/lorem ipsum/i, /\bTODO\b/, /\bFIXME\b/, /\bundefined\b/, /\bNaN\b/, /\[object Object\]/, /Invalid Date/, /\{\{|\}\}/, /\bnull\b/, /\[NOMBRE|\[JUGADOR/i, /\$-?NaN/]
  for (const p of pats) {
    const m = body.match(p)
    if (m) {
      const i = m.index ?? 0
      out.issues.push(`placeholder-looking text ${p}: "…${short(body.slice(Math.max(0, i - 25), i + 25), 60)}…"`)
    }
  }
  if (/example\.com/.test(body)) out.notes.push('shows example.com addresses (invented fixture data)')

  // Broken images
  const broken = [...document.images].filter((i) => i.complete && i.naturalWidth === 0 && i.getBoundingClientRect().width > 0)
  if (broken.length) out.issues.push(`${broken.length} broken image(s): ${broken.slice(0, 3).map((i) => i.getAttribute('src')?.slice(0, 60)).join(', ')}`)
  return out
}

/**
 * Screenshot the viewport (and, with full, the page capped at FULL_CAP css px) and record observations.
 */
async function snap(page, { route, fixture, device, state = '', full = false, keepScroll = false, fullOnly = false }) {
  const url = page.url()
  if (!keepScroll) {
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.waitForTimeout(150)
  }
  const shots = []
  const name = (st) => {
    let file = `${route}-${fixture}-${device}-light${st ? '-' + st : ''}.png`
    if (fs.existsSync(path.join(OUT, file)) && !mine.has(file)) file = file.replace(/\.png$/, '-shotsc.png')
    return file
  }
  const console_ = [...page._buf]
  page._buf = []
  if (!fullOnly) {
    const a = await page.evaluate(analyze, true)
    const file = name(state)
    await page.screenshot({ path: path.join(OUT, file) })
    shots.push({ file, st: state, a })
  }
  const vh = page.viewportSize().height
  const sh = await page.evaluate(() => document.scrollingElement.scrollHeight)
  if (full && sh > vh + 4) {
    await page.evaluate(() => window.scrollTo(0, 0))
    const a = await page.evaluate(analyze, false)
    const st = state ? `${state}-full` : 'full'
    const file = name(st)
    const w = page.viewportSize().width
    await page.screenshot({ path: path.join(OUT, file), fullPage: true, clip: { x: 0, y: 0, width: w, height: Math.min(sh, FULL_CAP) } })
    if (sh > FULL_CAP) a.notes.push(`page is ${sh}px tall; capped at ${FULL_CAP}px`)
    shots.push({ file, st, a })
  }
  for (const s of shots) {
    const obs = [...s.a.issues, ...s.a.notes, ...console_]
    const vp = page.viewportSize()
    results.push({
      file: s.file,
      url,
      device,
      viewport: `${vp.width}×${vp.height}@${DEVICES[device].dsf}x`,
      fixture,
      route,
      state: s.st || 'default',
      title: s.a.title,
      scrollH: s.a.scrollH,
      scrollW: s.a.scrollW,
      auto: { issues: s.a.issues, notes: s.a.notes, console: console_ },
      observations: obs,
    })
    mine.add(s.file)
    console.log(`${s.file}  ${obs.length ? '⚑ ' + obs.join(' | ').slice(0, 300) : 'ok'}`)
  }
  save()
}

async function attempt(label, fn) {
  try {
    await fn()
  } catch (e) {
    const msg = `${label}: ${String(e.message || e).split('\n')[0].slice(0, 200)}`
    console.log('FAILED', msg)
    results.push({ file: null, url: null, device: null, fixture: null, route: label, state: 'failed', observations: [`could not capture: ${msg}`] })
    save()
  }
}

// ---------------------------------------------------------------- sections

async function localSection() {
  // 1. Real routes on the shared preview server (logged out; production Supabase behind them).
  for (const device of ['15pro', 'se', 'laptop']) {
    const { ctx, page } = await newCtx(device)
    await attempt(`home ${device}`, async () => {
      await visit(page, `${BASE}/`)
      await snap(page, { route: 'home', fixture: 'local', device, full: true })
    })
    if (device !== 'se') {
      await attempt(`organizer_login ${device}`, async () => {
        await visit(page, `${BASE}/organizer/login`)
        await snap(page, { route: 'organizer_login', fixture: 'local', device })
        // The sign-up side of the same screen (no network: just the toggle).
        await page.getByRole('button', { name: 'Crear una cuenta', exact: true }).click({ timeout: 4000 })
        await settle(page, 300)
        await snap(page, { route: 'organizer_login', fixture: 'local', device, state: 'signup' })
      })
      await attempt(`organizer_reset ${device}`, async () => {
        await visit(page, `${BASE}/organizer/reset`)
        await snap(page, { route: 'organizer_reset', fixture: 'local', device })
      })
    }
    if (device === '15pro') {
      await attempt('entrar', async () => {
        await visit(page, `${BASE}/entrar`)
        await snap(page, { route: 'entrar', fixture: 'local', device, full: true })
      })
      for (const [route, p] of [
        ['privacidad', '/privacidad'],
        ['terminos', '/terminos'],
      ]) {
        await attempt(route, async () => {
          await visit(page, `${BASE}${p}`)
          await snap(page, { route, fixture: 'local', device, full: true })
        })
      }
      await attempt('notfound', async () => {
        await visit(page, `${BASE}/esto-no-existe`)
        await snap(page, { route: 'notfound', fixture: 'local', device })
      })
    }
    if (device === 'laptop') {
      await attempt('fixture_index', async () => {
        await visit(page, `${BASE}/fixture`)
        await snap(page, { route: 'fixture_index', fixture: 'fx', device, full: true })
      })
    }
    await ctx.close()
  }
}

async function wizardSection() {
  for (const device of ['15pro', 'laptop']) {
    const { ctx, page } = await newCtx(device)
    const R = { route: 'organizer_nuevo', fixture: 'demo', device }
    const next = () => page.getByRole('button', { name: 'Siguiente', exact: true }).click()
    const back = () => page.getByRole('button', { name: 'Atrás', exact: true }).click()
    const players = () => page.locator('input[aria-label="¿Cuántos jugadores?"]')
    const setPlayers = async (n) => {
      await players().fill(String(n))
      await players().blur()
    }
    await attempt(`wizard ${device}`, async () => {
      await visit(page, `${BASE}/organizer/nuevo/_`)
      await snap(page, { ...R, state: 'step01' })
      await page.getByPlaceholder('Copa de los Compadres').fill('Copa de los Compadres 2026')
      await page.getByPlaceholder('Valle de Bravo, noviembre').fill('Valle de Bravo, noviembre')
      await settle(page, 200)
      await snap(page, { ...R, state: 'step01-filled' })
      await next()
      await settle(page)
      await snap(page, { ...R, state: 'step02', full: true })

      // The format's "Cómo se juega" sheet.
      await attempt(`wizard ${device} formatinfo`, async () => {
        await page.getByRole('button', { name: 'Cómo se juega Stableford' }).click()
        await settle(page, 400)
        await snap(page, { ...R, state: 'step02-formatinfo' })
        await page.getByRole('dialog').getByRole('button', { name: 'Cerrar' }).first().click()
        await settle(page, 300)
      })

      // Configure: 12 players, 2 days, money on ($1,000, 40/30/20/10), two side games.
      await setPlayers(12)
      await page.getByRole('radio', { name: '2', exact: true }).click()
      await page.locator('label.toggle', { hasText: '¿Juegan por dinero?' }).click()
      await settle(page, 200)
      const fee = page.locator('input[aria-label="Inscripción por jugador"]')
      await fee.fill('1000')
      await fee.blur()
      await page.getByRole('radio', { name: '40/30/20/10', exact: true }).click()
      await page.getByRole('switch', { name: 'Skins', exact: true }).click()
      await page.getByRole('switch', { name: 'Más cerca del hoyo', exact: true }).click()
      await settle(page, 300)
      await snap(page, { ...R, state: 'step02-configured', full: true })

      // Templates sheet.
      await page.getByRole('button', { name: '¿Prefieres empezar de una plantilla?' }).click()
      await settle(page, 400)
      await snap(page, { ...R, state: 'step02-templates' })
      await page.getByRole('dialog').getByRole('button', { name: 'Cerrar' }).first().click()
      await settle(page, 300)

      // Step 3, balanced (percent split balances by construction).
      await next()
      await settle(page)
      await snap(page, { ...R, state: 'step03-balanced', full: true })

      // Unbalanced: the Calcutta template (fixed amounts for 12) with 10 players.
      await back()
      await settle(page, 300)
      await page.getByRole('button', { name: '¿Prefieres empezar de una plantilla?' }).click()
      await settle(page, 300)
      await page.getByRole('radio', { name: /Viaje con Calcutta/ }).click()
      await settle(page, 400)
      await snap(page, { ...R, state: 'step02-replace-confirm' })
      await page.getByRole('button', { name: 'Cambiar', exact: true }).click()
      await settle(page, 300)
      await setPlayers(10)
      await settle(page, 300)
      await snap(page, { ...R, state: 'step02-calcutta10', full: true })
      await next()
      await settle(page)
      await snap(page, { ...R, state: 'step03-unbalanced', full: true })

      // Back to 12 → balanced → create (demo: no write).
      await back()
      await settle(page, 300)
      await setPlayers(12)
      await next()
      await settle(page)
      await snap(page, { ...R, state: 'step03-calcutta12', full: true })
      await page.getByRole('button', { name: 'Crear torneo', exact: true }).click()
      await settle(page)
      await snap(page, { ...R, state: 'step04-created', full: true })
    })
    await ctx.close()
  }
}

async function profileSection() {
  {
    const device = '15pro'
    const { ctx, page } = await newCtx(device)
    for (const name of ['yo', 'nuevo', 'extrano', 'manual']) {
      await attempt(`p ${name}`, async () => {
        await visit(page, `${BASE}/p/_/${name}`)
        await snap(page, { route: 'p', fixture: name, device, full: true })
      })
    }
    for (const name of ['rivalidad', 'propuesta', 'amigos', 'nuevo']) {
      await attempt(`p_vs ${name}`, async () => {
        await visit(page, `${BASE}/p/_/${name}/vs`)
        await snap(page, { route: 'p_vs', fixture: name, device, full: true })
      })
    }
    for (const name of ['yo', 'manual', 'nuevo', 'extrano']) {
      await attempt(`p_anio ${name}`, async () => {
        await visit(page, `${BASE}/p/_/${name}/anio`)
        await snap(page, { route: 'p_anio', fixture: name, device, full: true })
      })
    }
    for (const [route, p] of [
      ['amigos', '/amigos/_'],
      ['avisos', '/avisos/_'],
      ['c', '/c/_'],
    ]) {
      await attempt(route, async () => {
        await visit(page, `${BASE}${p}`)
        await snap(page, { route, fixture: 'fx', device, full: true })
      })
    }
    // Ronda rápida: default, configured (friends, a guest, games, money), too many players.
    await attempt('ronda 15pro', async () => {
      await visit(page, `${BASE}/ronda/_`)
      await snap(page, { route: 'ronda', fixture: 'fx', device, full: true })
      await page.locator('label', { hasText: 'Diego Ortiz' }).click()
      await page.locator('label', { hasText: 'Mauricio Lozano' }).click()
      await page.locator('input[aria-label="Nombre del invitado"]').fill('Chuy Barragán')
      await page.getByRole('button', { name: 'Agregar', exact: true }).click()
      await page.locator('input[aria-label="Índice de Chuy Barragán"]').fill('18.5')
      await page.getByRole('button', { name: 'Birdies', exact: true }).click()
      await page.locator('label.toggle', { hasText: 'Con dinero' }).click()
      await settle(page, 200)
      await page.locator('section', { hasText: 'A qué juegan' }).locator('input[inputmode="numeric"]').fill('300')
      await settle(page, 300)
      await snap(page, { route: 'ronda', fixture: 'fx', device, state: 'configured', full: true })
      // Money section in view (the pot line), viewport-only.
      await page.locator('label.toggle', { hasText: 'Con dinero' }).scrollIntoViewIfNeeded()
      await page.evaluate(() => window.scrollBy(0, 120))
      await settle(page, 200)
      await snap(page, { route: 'ronda', fixture: 'fx', device, state: 'configured-money', keepScroll: true })
      // Past the 16-player limit: me + 2 friends + 1 guest so far → 14 more guests = 18.
      for (let i = 1; i <= 14; i++) {
        await page.locator('input[aria-label="Nombre del invitado"]').fill(`Invitado ${i}`)
        await page.getByRole('button', { name: 'Agregar', exact: true }).click()
      }
      await settle(page, 300)
      await page.getByText('Máximo 16 jugadores.').scrollIntoViewIfNeeded()
      await page.evaluate(() => window.scrollBy(0, -80))
      await settle(page, 200)
      await snap(page, { route: 'ronda', fixture: 'fx', device, state: 'toomany', keepScroll: true })
      await page.getByRole('button', { name: 'Empezar', exact: true }).scrollIntoViewIfNeeded()
      await settle(page, 200)
      await snap(page, { route: 'ronda', fixture: 'fx', device, state: 'toomany-start', keepScroll: true })
    })
    await ctx.close()
  }
  {
    const device = 'se'
    const { ctx, page } = await newCtx(device)
    await attempt('p yo se', async () => {
      await visit(page, `${BASE}/p/_/yo`)
      await snap(page, { route: 'p', fixture: 'yo', device, full: true })
    })
    await attempt('ronda se', async () => {
      await visit(page, `${BASE}/ronda/_`)
      await snap(page, { route: 'ronda', fixture: 'fx', device, full: true })
    })
    await ctx.close()
  }
}

async function adminSection() {
  const details = { torneos: 'f-nacho', personas: 'p-phone', campos: 'c-solmar', crews: 'k-jueves' }
  for (const device of ['laptop', '15pro']) {
    const { ctx, page } = await newCtx(device)
    for (const s of ['resumen', 'torneos', 'personas', 'campos', 'crews', 'avisos', 'auditoria', 'salud']) {
      await attempt(`admin ${s} ${device}`, async () => {
        await visit(page, `${BASE}/admin/_/${s}`)
        await snap(page, { route: `admin_${s}`, fixture: 'fx', device, full: true })
        const id = details[s]
        if (id) {
          await page.locator(`a[href$="/admin/_/${s}/${id}"]`).first().click()
          await settle(page)
          await snap(page, { route: `admin_${s}`, fixture: 'fx', device, state: 'detail', full: true })
        }
      })
    }
    await ctx.close()
  }
}

async function prodSection() {
  // One context for every production shot: /t/ensayo signs in anonymously once.
  const { ctx, page } = await newCtx('15pro')
  for (const device of ['15pro', 'se']) {
    const d = DEVICES[device]
    await page.setViewportSize({ width: d.width, height: d.height })
    await attempt(`prod home ${device}`, async () => {
      await visit(page, `${PROD}/`)
      await snap(page, { route: 'home', fixture: 'prod', device, full: true })
    })
  }
  for (const device of ['15pro', 'se']) {
    const d = DEVICES[device]
    await page.setViewportSize({ width: d.width, height: d.height })
    await attempt(`prod t_entrar ${device}`, async () => {
      page._buf = []
      await page.goto(`${PROD}/t/ensayo`, { waitUntil: 'domcontentloaded', timeout: 45000 })
      await page.locator('[class*="_face_"]').first().waitFor({ timeout: 45000 })
      await settle(page)
      await snap(page, { route: 't_entrar', fixture: 'prod', device, full: true })
      const faces = page.locator('button[class*="_face_"]')
      const n = await faces.count()
      let pick = -1
      for (let i = 0; i < n; i++) {
        const name = (await faces.nth(i).locator('[class*="_faceName_"]').innerText()).trim()
        if (!/^nico$/i.test(name)) {
          pick = i
          break
        }
      }
      if (pick < 0) throw new Error('no non-Nico face found')
      await faces.nth(pick).click()
      await page.locator('input[type="password"]').waitFor({ timeout: 10000 })
      await settle(page, 400)
      await snap(page, { route: 't_entrar', fixture: 'prod', device, state: 'pinpad' })
      const pr = results[results.length - 1]
      pr.observations.push(`tapped face #${pick + 1} of ${n} (not Nico); no PIN typed`)
      save()
    })
  }
  await ctx.close()
}

if (SECTIONS.includes('local')) await localSection()
if (SECTIONS.includes('wizard')) await wizardSection()
if (SECTIONS.includes('profile')) await profileSection()
if (SECTIONS.includes('admin')) await adminSection()
if (SECTIONS.includes('prod')) await prodSection()
await browser.close()
console.log(`done: ${results.filter((r) => r.file).length} shots → ${RAW}`)
