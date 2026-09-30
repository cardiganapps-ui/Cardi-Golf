// MOT harness helpers (review only; no product code touched)
import { chromium } from 'playwright-core'
import { execSync } from 'node:child_process'
export const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
export const BASE = process.env.BASE || 'http://127.0.0.1:4190'
export const DEV = {
  se: { viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  '15pro': { viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  android: { viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  laptop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  tv: { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 },
}
export function load() { return execSync('cat /proc/loadavg').toString().trim().split(' ').slice(0, 3).join(' ') }
export async function launch(opts = {}) {
  return chromium.launch({ executablePath: EXE, args: ['--disable-gpu-vsync-off'], ...opts })
}
export async function ctx(browser, device = '15pro', extra = {}) {
  return browser.newContext({ ...DEV[device], locale: 'es-MX', timezoneId: 'America/Mazatlan', ...extra })
}
export async function throttle(page, rate) {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate })
  return cdp
}
// rAF sampler: start before the trigger, stop after; returns frame deltas (ms)
export const SAMPLER = `
window.__mot = { deltas: [], t0: 0, running: false, loafs: [] };
window.__motStart = () => {
  const m = window.__mot; m.deltas = []; m.running = true; m.loafs = []; let last = performance.now(); m.t0 = last;
  const tick = (t) => { if (!m.running) return; m.deltas.push(t - last); last = t; requestAnimationFrame(tick) };
  requestAnimationFrame((t) => { last = t; requestAnimationFrame(tick) });
  try { m.po && m.po.disconnect(); m.po = new PerformanceObserver((l) => { for (const e of l.getEntries()) m.loafs.push({ d: Math.round(e.duration), block: Math.round(e.blockingDuration || 0) }) }); m.po.observe({ type: 'long-animation-frame', buffered: false }) } catch (e) { m.loafErr = String(e) }
};
window.__motStop = () => { const m = window.__mot; m.running = false; try { m.po && m.po.disconnect() } catch {} ; return { deltas: m.deltas.map((d) => Math.round(d * 10) / 10), loafs: m.loafs, loafErr: m.loafErr } };
`
export function summarize(deltas) {
  if (!deltas.length) return { frames: 0 }
  const s = [...deltas].sort((a, b) => a - b)
  const med = s[Math.floor(s.length / 2)]
  const over = (x) => deltas.filter((d) => d > x).length
  // dropped frames estimate: for each delta, frames missed = round(delta/16.67) - 1
  const dropped = deltas.reduce((a, d) => a + Math.max(0, Math.round(d / 16.67) - 1), 0)
  return { frames: deltas.length, total: Math.round(deltas.reduce((a, b) => a + b, 0)), median: med, max: Math.max(...deltas), over25: over(25), over50: over(50), dropped }
}
export const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)] }
