// V12 / VIS-06: Ceremonia on a TV — computed sizes, contrast, accent, card area.
import { chromium } from 'playwright-core'
import fs from 'node:fs'
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const BASE = process.env.BASE || 'http://127.0.0.1:4212'
const OUT = '/tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad/verify/evidence/V12'
const FX = process.env.FIX || 'full12-finished'
const [W, H] = (process.env.VP || '1920x1080').split('x').map(Number)

// WCAG 2.x contrast
const lum = (rgb) => { const [r, g, b] = rgb.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }); return 0.2126 * r + 0.7152 * g + 0.0722 * b }
const parse = (s) => (s.match(/[\d.]+/g) || []).slice(0, 4).map(Number)
const cr = (a, b) => { const A = lum(parse(a)), B = lum(parse(b)); return ((Math.max(A, B) + 0.05) / (Math.min(A, B) + 0.05)).toFixed(2) }

const browser = await chromium.launch({ executablePath: EXE })
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, locale: 'es-MX', timezoneId: 'America/Mazatlan', reducedMotion: 'reduce' })
const page = await ctx.newPage()
const out = { viewport: `${W}x${H}`, fixture: FX }

// same tournament, other screens: the event accent on a primary element
await page.goto(`${BASE}/t/_/${FX}/mas`, { waitUntil: 'networkidle' })
out.accentOnMas = await page.evaluate(() => { const w = document.querySelector('[style*="--event-accent"]'); return { eventAccentVar: w ? getComputedStyle(w).getPropertyValue('--event-accent').trim() : null, primaryBtnBg: (() => { const b = document.querySelector('.btn--primary'); return b ? getComputedStyle(b).backgroundColor : null })() } })
await page.goto(`${BASE}/t/_/${FX}/tv`, { waitUntil: 'networkidle' })
out.accentOnTv = await page.evaluate(() => { const w = document.querySelector('[style*="--event-accent"]'); return w ? getComputedStyle(w).getPropertyValue('--event-accent').trim() : null })

await page.goto(`${BASE}/t/_/${FX}/ceremonia`, { waitUntil: 'networkidle' })
await page.evaluate(() => document.fonts.ready)
await page.waitForTimeout(600)

const probe = () => {
  const q = (sel) => document.querySelector(sel)
  const fsOf = (el) => (el ? Math.round(parseFloat(getComputedStyle(el).fontSize) * 10) / 10 : null)
  const stage = q('[class*="_stage_"]')
  const stageBg = stage ? getComputedStyle(stage).backgroundColor : null
  const btn = (re) => { const b = [...document.querySelectorAll('button')].find((x) => re.test(x.textContent)); if (!b) return null; const cs = getComputedStyle(b); const r = b.getBoundingClientRect(); return { text: b.textContent.trim(), fs: fsOf(b), color: cs.color, bg: cs.backgroundColor, border: cs.borderColor, w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.left), y: Math.round(r.top), disabled: b.disabled } }
  const card = q('[class*="_winner_"]')
  const cb = card?.getBoundingClientRect()
  const center = q('[class*="_center_"]')?.getBoundingClientRect()
  return {
    stageBg,
    headerTitle: { text: q('[class*="_title_"]')?.textContent, fs: fsOf(q('[class*="_title_"]')) },
    tournamentName: { text: q('[class*="_sub_"]')?.textContent, fs: fsOf(q('[class*="_sub_"]')) },
    exitLink: fsOf(q('[class*="_exit_"]')),
    hint: fsOf(q('[class*="_hint_"]')),
    stepTitle: { text: q('[class*="_stepTitle_"]')?.textContent, fs: fsOf(q('[class*="_stepTitle_"]')) },
    winnerLine: fsOf(q('[class*="_winnerLine_"]')), winnerSub: fsOf(q('[class*="_winnerSub_"]')), trophy: fsOf(q('[class*="_trophy_"]')), list: fsOf(q('[class*="_list_"]')),
    progress: { text: q('[class*="_progress_"]')?.textContent, fs: fsOf(q('[class*="_progress_"]')) },
    start: btn(/Empezar/), reveal: btn(/Revelar/), next: btn(/Siguiente/), prev: btn(/Anterior/),
    card: cb ? { x: Math.round(cb.left), y: Math.round(cb.top), w: Math.round(cb.width), h: Math.round(cb.height), pctOfScreen: +((cb.width * cb.height) / (innerWidth * innerHeight) * 100).toFixed(1) } : null,
    centerBox: center ? { w: Math.round(center.width), h: Math.round(center.height), pctOfScreen: +((center.width * center.height) / (innerWidth * innerHeight) * 100).toFixed(1) } : null,
  }
}
const snap = async (label) => { const r = await page.evaluate(probe); out[label] = r; await page.screenshot({ path: `${OUT}/v06-${FX}-${W}x${H}-${label}.png` }); return r }

await snap('start')
await page.getByRole('button', { name: /Empezar/ }).click(); await page.waitForTimeout(700)
await snap('step1')
// go to the champion step: iterate until a step whose reveal shows the champion class
let champion = null
for (let i = 0; i < 40; i++) {
  const t = await page.evaluate(() => document.querySelector('[class*="_stepTitle_"]')?.textContent)
  const rev = page.getByRole('button', { name: /Revelar/ })
  if (await rev.count()) { await rev.click(); await page.waitForTimeout(700) }
  const isChamp = await page.evaluate(() => !!document.querySelector('[class*="_champion_"]'))
  if (isChamp) { champion = await snap('champion'); champion.stepTitleText = t; break }
  await page.getByRole('button', { name: /Siguiente/ }).click(); await page.waitForTimeout(600)
}
// contrast summary
const s0 = out.start, s1 = out.step1
out.contrast = {
  startBtn_vs_stage: s0.start ? cr(s0.start.bg, s0.stageBg) : null,
  startBtn_text_vs_bg: s0.start ? cr(s0.start.color, s0.start.bg) : null,
  revealBtn_vs_stage: s1.reveal ? cr(s1.reveal.bg, s1.stageBg) : null,
  next_text_vs_own_bg: s1.next ? cr(s1.next.color, s1.next.bg) : null,
  next_bg_vs_stage: s1.next ? cr(s1.next.bg, s1.stageBg) : null,
  prev_text_vs_stage: s1.prev ? cr(s1.prev.color, s1.stageBg) : null,
}
fs.writeFileSync(`${OUT}/v06-ceremonia-${FX}-${W}x${H}.json`, JSON.stringify(out, null, 1))
const pick = (o) => o && JSON.stringify(o)
console.log('accent: Más primary bg', out.accentOnMas.primaryBtnBg, '| Más --event-accent', out.accentOnMas.eventAccentVar, '| TV --event-accent', out.accentOnTv)
for (const k of ['start', 'step1', 'champion']) {
  const r = out[k]; if (!r) { console.log(k, 'n/a'); continue }
  console.log(`— ${k}: header «${r.headerTitle.text}» ${r.headerTitle.fs}px; name «${r.tournamentName.text}» ${r.tournamentName.fs}px; exit ${r.exitLink}px; hint ${r.hint}px; stepTitle «${r.stepTitle.text ?? ''}» ${r.stepTitle.fs}px; winnerLine ${r.winnerLine}px sub ${r.winnerSub}px trophy ${r.trophy}px list ${r.list}px; progress «${r.progress.text}» ${r.progress.fs}px`)
  for (const b of ['start', 'reveal', 'next', 'prev']) if (r[b]) console.log(`     btn ${b}: ${pick(r[b])}`)
  if (r.card) console.log(`     winner card ${pick(r.card)}; center column ${pick(r.centerBox)}`)
}
console.log('contrast', JSON.stringify(out.contrast))
await browser.close()
