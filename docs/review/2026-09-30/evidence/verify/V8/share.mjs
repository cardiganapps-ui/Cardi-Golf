// V8 / PWA-04: share card offline, then online in the same session, then after a reload.
// Usage: node share.mjs <label>   (server on :4208 serving site/)
import { chromium } from 'playwright-core'
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const URL0 = 'http://127.0.0.1:4208/t/_/full12-live'
const label = process.argv[2] || 'as-built'
const b = await chromium.launch({ executablePath: EXE })

async function controlledPage() {
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, acceptDownloads: true })
  const page = await ctx.newPage()
  await page.goto(URL0, { waitUntil: 'networkidle' })
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.reload({ waitUntil: 'networkidle' })
  // make sure the precache is complete and the page is controlled
  const st = await page.evaluate(async () => ({ controlled: !!navigator.serviceWorker.controller, share: typeof navigator.share, canShare: typeof navigator.canShare }))
  return { ctx, page, st }
}
async function tryShare(page, tag) {
  const failed = []
  const onFail = (r) => failed.push(r.url().replace('http://127.0.0.1:4208', '') + ' ' + (r.failure()?.errorText || ''))
  page.on('requestfailed', onFail)
  const fetched = []
  const onReq = (r) => { if (/\.(woff2|png)(\?|$)/.test(r.url())) fetched.push(r.url().replace('http://127.0.0.1:4208', '')) }
  page.on('request', onReq)
  const t0 = Date.now()
  const dl = page.waitForEvent('download', { timeout: 15000 }).then((d) => `download ${d.suggestedFilename()}`).catch(() => null)
  const fail = page.getByText('No se pudo generar la imagen.').waitFor({ timeout: 15000 }).then(() => 'toast: No se pudo generar la imagen.').catch(() => null)
  await page.getByRole('button', { name: 'Compartir tabla' }).click()
  const outcome = await Promise.race([dl, fail])
  const ms = Date.now() - t0
  page.off('requestfailed', onFail); page.off('request', onReq)
  await page.waitForTimeout(3500) // let a toast clear
  console.log(`[${label}] ${tag}: ${outcome ?? 'nothing within 15 s'} (${ms} ms) | fetched ${fetched.length} font/png URL(s)${fetched.length ? ' e.g. ' + fetched.slice(0, 2).join(', ') : ''} | failed ${failed.length}${failed.length ? ': ' + failed.slice(0, 3).join(' ; ') + (failed.length > 3 ? ' …' : '') : ''}`)
}

// Control: never offline
{
  const { ctx, page, st } = await controlledPage()
  console.log(`[${label}] control page: ${JSON.stringify(st)}`)
  await tryShare(page, 'control online #1')
  await tryShare(page, 'control online #2')
  await ctx.close()
}
// Offline first, then online in the same session, then a reload
{
  const { ctx, page } = await controlledPage()
  await ctx.setOffline(true)
  await tryShare(page, 'offline')
  await ctx.setOffline(false)
  await tryShare(page, 'online again #1')
  await tryShare(page, 'online again #2')
  await page.reload({ waitUntil: 'networkidle' })
  await tryShare(page, 'after a reload (online)')
  await ctx.close()
}
await b.close()
