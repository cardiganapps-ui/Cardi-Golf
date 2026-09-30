// prefers-reduced-motion, forced-colors and a glare filter, with screenshots.
import { chromium } from 'playwright-core'
import fs from 'node:fs'
import path from 'node:path'
const DIR = path.dirname(new URL(import.meta.url).pathname)
const BASE = 'http://127.0.0.1:4173'
const SHOTS = '/home/user/Cardi-Golf/docs/review/2026-09-30/shots/'
const F = '/t/_/full12-live'
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const out = {}
const running = (page) =>
  page.evaluate(() =>
    document.getAnimations().map((a) => {
      const t = a.effect?.getTiming?.() ?? {}
      const el = a.effect?.target
      return { name: a.animationName ?? a.constructor.name, dur: t.duration, iter: t.iterations, state: a.playState, el: el ? `${el.tagName}.${String(el.className).slice(0, 40)}` : null }
    }),
  )

// 1) Reduced motion: which animations still run?
{
  const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, reducedMotion: 'reduce' })
  const page = await ctx.newPage()
  const probes = {}
  await page.goto(BASE + F, { waitUntil: 'networkidle' })
  await page.waitForTimeout(200)
  probes.liveLoad = await running(page)
  // Toggle Puntos/Gross (re-sorts the board with layout animation)
  await page.getByRole('radio', { name: 'Gross' }).click().catch(() => undefined)
  await page.waitForTimeout(30)
  probes.liveResort = await running(page)
  await page.locator('button[aria-label*=".º"]').first().click()
  await page.waitForTimeout(20)
  probes.sheetOpen = await running(page)
  await page.goto(BASE + F + '/tv', { waitUntil: 'networkidle' })
  await page.waitForTimeout(12500)
  probes.tvRotate = await running(page)
  await page.goto(BASE + F + '/ceremonia', { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: /empezar/i }).click().catch(() => undefined)
  await page.waitForTimeout(40)
  probes.ceremonyReveal = await running(page)
  await page.goto(BASE + F + '/admin/parejas', { waitUntil: 'networkidle' })
  await page.waitForTimeout(300)
  probes.draw = await running(page)
  out.reducedMotion = Object.fromEntries(Object.entries(probes).map(([k, v]) => [k, { count: v.length, withDuration: v.filter((a) => a.dur > 0).length, examples: v.filter((a) => a.dur > 0).slice(0, 5) }]))
  // Same probes without the preference, to show what normally runs.
  await ctx.close()
  const ctx2 = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, reducedMotion: 'no-preference' })
  const p2 = await ctx2.newPage()
  await p2.goto(BASE + F, { waitUntil: 'networkidle' })
  await p2.getByRole('radio', { name: 'Gross' }).click().catch(() => undefined)
  await p2.waitForTimeout(30)
  out.noPreferenceResort = (await running(p2)).filter((a) => a.dur > 0).length
  await p2.locator('button[aria-label*=".º"]').first().click()
  await p2.waitForTimeout(20)
  out.noPreferenceSheet = (await running(p2)).filter((a) => a.dur > 0).length
  await ctx2.close()
  console.log('reduced motion', JSON.stringify(out.reducedMotion, null, 1), 'noPref resort', out.noPreferenceResort, 'sheet', out.noPreferenceSheet)
}

// 2) Forced colors (Windows High Contrast / "Contraste" themes)
{
  const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, forcedColors: 'active', colorScheme: 'dark' })
  const page = await ctx.newPage()
  const cases = [
    [F, 't-full12-live-15pro-dark-a11y-forcedcolors.png'],
    [F + '/tarjeta', 't_tarjeta-full12-live-15pro-dark-a11y-forcedcolors.png'],
    [F + '/tarjeta#grid', 't_tarjeta-full12-live-15pro-dark-a11y-forcedcolors-grid.png'],
    [F + '/admin/torneo', 't_admin_torneo-full12-live-15pro-dark-a11y-forcedcolors.png'],
    [F + '/dinero', 't_dinero-full12-live-15pro-dark-a11y-forcedcolors.png'],
  ]
  out.forced = {}
  for (const [route, shot] of cases) {
    const [p, hash] = route.split('#')
    await page.goto(BASE + p, { waitUntil: 'networkidle' })
    await page.waitForTimeout(500)
    if (hash === 'grid') await page.getByRole('button', { name: /^Ver tarjeta$/ }).click()
    await page.waitForTimeout(300)
    out.forced[route] = await page.evaluate(() => {
      const seg = document.querySelector('[role="radio"][aria-checked="true"]')
      const segOff = document.querySelector('[role="radio"][aria-checked="false"]')
      const tog = [...document.querySelectorAll('.toggle input')].slice(0, 2).map((i) => ({ checked: i.checked, bg: getComputedStyle(i).backgroundColor, knob: getComputedStyle(i, '::after').backgroundColor, border: getComputedStyle(i).borderStyle }))
      const mark = document.querySelector('svg[class*="markSvg"]')
      return {
        segOn: seg ? { bg: getComputedStyle(seg).backgroundColor, color: getComputedStyle(seg).color } : null,
        segOff: segOff ? { bg: getComputedStyle(segOff).backgroundColor, color: getComputedStyle(segOff).color } : null,
        toggles: tog,
        markStroke: mark ? getComputedStyle(mark).stroke : null,
        mine: (() => {
          const m = document.querySelector('[class*="_mine_"]')
          return m ? getComputedStyle(m).backgroundColor : null
        })(),
      }
    })
    await page.screenshot({ path: SHOTS + shot })
  }
  console.log('forced', JSON.stringify(out.forced, null, 1))
  await ctx.close()
}

// 3) Glare: CSS filter contrast(.6) brightness(1.2) over the whole page
{
  const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  const page = await ctx.newPage()
  for (const [route, shot] of [
    [F, 't-full12-live-15pro-light-a11y-glare.png'],
    [F + '/tarjeta', 't_tarjeta-full12-live-15pro-light-a11y-glare.png'],
    ['/organizer/nuevo/_', 'organizer_nuevo-demo-15pro-light-a11y-glare.png'],
  ]) {
    await page.goto(BASE + route, { waitUntil: 'networkidle' })
    await page.waitForTimeout(500)
    await page.addStyleTag({ content: 'html{filter:contrast(.6) brightness(1.2)}' })
    await page.waitForTimeout(200)
    await page.screenshot({ path: SHOTS + shot })
  }
  await ctx.close()
}
fs.writeFileSync(path.join(DIR, 'prefs.json'), JSON.stringify(out, null, 1))
await browser.close()
