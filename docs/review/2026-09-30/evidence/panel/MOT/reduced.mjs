// Reduced-motion audit: the same interactions with reducedMotion 'no-preference' vs 'reduce' (production preview :4190).
import { launch, ctx, BASE } from './lib.mjs'
import { writeFileSync } from 'node:fs'
const b = await launch()
const out = {}
async function page(mode, device, path) {
  const c = await ctx(b, device, { reducedMotion: mode })
  const p = await c.newPage()
  await p.goto(BASE + path, { waitUntil: 'networkidle' })
  await p.waitForTimeout(900)
  return { c, p }
}
// generic per-frame sampler of an element's opacity/transform for N ms
const SAMPLE = (p, sel, ms) => p.evaluate(([sel, ms]) => new Promise((res) => { const tr = []; const t0 = performance.now(); const f = () => { const el = document.querySelector(sel); if (el) { const cs = getComputedStyle(el); const m = new DOMMatrix(cs.transform === 'none' ? undefined : cs.transform); tr.push([Math.round(performance.now() - t0), Math.round(parseFloat(cs.opacity) * 100) / 100, Math.round(m.m42 * 10) / 10, Math.round(m.a * 1000) / 1000]) } if (performance.now() - t0 < ms) requestAnimationFrame(f); else res(tr) }; requestAnimationFrame(f) }), [sel, ms])
const moving = (tr) => tr.filter((x) => x[1] < 1 || Math.abs(x[2]) > 0.5 || Math.abs(x[3] - 1) > 0.002).length
for (const mode of ['no-preference', 'reduce']) {
  const r = {}
  // 1. sheet open (player sheet)
  { const { c, p } = await page(mode, '15pro', '/t/_/full12-live'); const s = SAMPLE(p, '[role="dialog"]', 500); await p.locator('button[aria-label]').filter({ hasText: 'Leonel' }).first().click(); r.sheetOpenAnimatedFrames = moving(await s); r.sheetAnimationDuration = await p.evaluate(() => getComputedStyle(document.querySelector('[role="dialog"]')).animationDuration); await c.close() }
  // 2. Tarjeta save with a net birdie (Iván at par): confetti canvas + toast animation
  { const { c, p } = await page(mode, '15pro', '/t/_/full12-live/tarjeta'); await p.getByRole('button', { name: /^Guardar hoyo/ }).click(); await p.waitForTimeout(250); r.confettiCanvas = await p.evaluate(() => document.querySelectorAll('body > canvas').length); r.toastAnimationDuration = await p.evaluate(() => { const t = document.querySelector('[role="status"][class*="toast"]'); return t ? getComputedStyle(t).animationDuration : 'no toast' }); await c.close() }
  // 3. Ceremonia: step enter (y spring) and champion confetti
  { const { c, p } = await page(mode, 'laptop', '/t/_/full12-finished/ceremonia'); await p.getByRole('button', { name: 'Empezar la ceremonia' }).click(); await p.waitForTimeout(450); const s = SAMPLE(p, '[class*="body"] > div', 600); const tr = await s; r.ceremonyStepMaxAbsY = Math.max(0, ...tr.map((x) => Math.abs(x[2]))); r.ceremonyStepOpacityFrames = tr.filter((x) => x[1] < 1).length;
    // jump to the champion step
    for (let k = 0; k < 20; k++) { const t = await p.evaluate(() => document.querySelector('h2')?.textContent || ''); if (/Campe/i.test(t)) break; await p.getByRole('button', { name: 'Siguiente' }).click(); await p.waitForTimeout(mode === 'reduce' ? 350 : 900) }
    r.ceremonyAt = await p.evaluate(() => document.querySelector('h2')?.textContent)
    await p.getByRole('button', { name: 'Revelar' }).click(); await p.waitForTimeout(900); r.championConfettiCanvas = await p.evaluate(() => document.querySelectorAll('body > canvas').length); await c.close() }
  // 4. TV rotation: y movement vs opacity
  { const { c, p } = await page(mode, 'tv', '/t/_/full12-live/tv'); await p.waitForTimeout(11000 - 900); const tr = await SAMPLE(p, 'section', 1800); r.tvRotateMaxAbsY = Math.max(0, ...tr.map((x) => Math.abs(x[2]))); r.tvRotateOpacityFrames = tr.filter((x) => x[1] < 1).length; await c.close() }
  // 5. Signed-card stamp in the grid (full12-finished): animates on mount?
  { const { c, p } = await page(mode, '15pro', '/t/_/full12-finished/tarjeta'); const s = SAMPLE(p, '[class*="stamp"]', 600); const btn = p.getByRole('button', { name: /Ver tarjeta|Ver hoyo/ }).first(); if (/Ver tarjeta/.test(await btn.textContent())) await btn.click(); const tr = await s; r.stampFrames = tr.length; r.stampAnimatedFrames = moving(tr); r.stampFirst = tr[0] ?? null; await c.close() }
  // 6. Comité › Tarjetas smooth scroll (scrollIntoView behavior smooth)
  { const { c, p } = await page(mode, '15pro', '/t/_/full12-live/admin/scores'); const btns = p.locator('button', { hasText: /^Ver$/ }); const n = await btns.count(); r.adminVerButtons = n; if (n) { const tr = p.evaluate(() => new Promise((res) => { const ys = []; const t0 = performance.now(); const f = () => { ys.push(Math.round(scrollY)); if (performance.now() - t0 < 900) requestAnimationFrame(f); else res(ys) }; requestAnimationFrame(f) })); await btns.first().click(); const ys = await tr; const distinct = [...new Set(ys)]; r.adminScrollDistinctPositions = distinct.length; r.adminScrollFromTo = [distinct[0], distinct[distinct.length - 1]] } await c.close() }
  out[mode] = r
  console.log(mode, JSON.stringify(r))
}
writeFileSync('reduced.json', JSON.stringify(out, null, 1))
await b.close()
