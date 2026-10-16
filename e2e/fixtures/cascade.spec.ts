/**
 * The first load is one stylesheet, and the app's own rules (src/styles/global.css) come before every CSS module's.
 *
 * Under Vite 8, Rolldown's automatic chunking put the modules that the entry and the lazy screens share in chunks
 * of their own, and a chunk's stylesheet is linked before the entry's. global.css is the entry's (main.tsx imports
 * it), so its `.card` came after ui.module.css's `.errorBox`, and an element with both (every ErrorBox) lost its
 * tint and drew the card's border: Comité › Historial on a failed load. primitives.module.css also shipped twice
 * on the first load. vite.config.ts keeps what the entry loads in one chunk, as Rollup did; this holds it there.
 * Measured on 52 screens: every element's computed style is the same as Vite 7's build.
 */
import { expect, open, test } from './base'

test('the first load is one stylesheet, and the app’s own rules come before every module’s', async ({ page }) => {
  const html = await (await page.request.get('/')).text()
  const sheets = [...html.matchAll(/<link\b[^>]*\brel="stylesheet"[^>]*\bhref="([^"]+)"/g)].map((m) => m[1])
  expect(sheets, 'stylesheets index.html links').toHaveLength(1)

  await open(page, '/t/_/full12-live')
  const order = await page.evaluate((href) => {
    const sheet = Array.from(document.styleSheets).find((s) => s.href && new URL(s.href).pathname === href)
    const selectors = sheet ? Array.from(sheet.cssRules).map((r) => (r instanceof CSSStyleRule ? r.selectorText : '')) : []
    return {
      found: !!sheet,
      card: selectors.indexOf('.card'),
      // A CSS module's class: `_name_hash_line`.
      firstModule: selectors.findIndex((s) => /\._[A-Za-z][\w-]*_[a-z0-9]{5}_\d+/.test(s)),
    }
  }, sheets[0])
  expect(order.found, `${sheets[0]} is on the page`).toBe(true)
  expect(order.card, 'global.css’s .card is in the first stylesheet').toBeGreaterThanOrEqual(0)
  expect(order.firstModule, 'a module rule is in the first stylesheet').toBeGreaterThan(0)
  expect(order.card, 'global.css’s .card comes before every module rule').toBeLessThan(order.firstModule)
})

test('a screen loaded later links its stylesheet after the entry’s, whatever the order the screens are opened in (PERF-02)', async ({ page }) => {
  // Each screen's rules come with its chunk: they must never land before global.css and the shared modules, or a
  // `.card` would beat a screen's own class as it did under Rolldown's split.
  const html = await (await page.request.get('/')).text()
  const entry = /<link\b[^>]*\brel="stylesheet"[^>]*\bhref="([^"]+)"/.exec(html)?.[1]
  for (const order of [
    ['', 'juegos', 'dinero', 'mas', 'admin/torneo', 'admin/scores'],
    ['admin/scores', 'mas', 'dinero', 'juegos', ''],
  ]) {
    await open(page, `/t/_/full12-live/${order[0]}`)
    for (const path of order.slice(1)) {
      await page.evaluate((to) => {
        history.pushState(null, '', to)
        dispatchEvent(new PopStateEvent('popstate'))
      }, `/t/_/full12-live/${path}`)
      await page.waitForLoadState('networkidle')
    }
    const sheets = await page.evaluate(() => Array.from(document.styleSheets, (s) => (s.href ? new URL(s.href).pathname : null)).filter(Boolean))
    expect(sheets[0], `the entry's stylesheet is the first (${order.join(' → ')})`).toBe(entry)
    expect(sheets.length, 'the screens brought stylesheets of their own').toBeGreaterThan(3)
    expect(new Set(sheets).size, 'no stylesheet twice').toBe(sheets.length)
  }
})
