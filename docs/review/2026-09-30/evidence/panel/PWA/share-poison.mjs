import { launch } from './lib.mjs'
const b = await launch()
async function session(goOfflineFirst) {
  const ctx = await b.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, acceptDownloads: true })
  const page = await ctx.newPage()
  await page.goto('http://127.0.0.1:4193/t/_/full12-live')
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.reload({ waitUntil: 'networkidle' })
  const fail = page.getByText('No se pudo generar la imagen.')
  const share = async () => {
    await fail.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {})
    let downloaded = false
    const onDl = () => { downloaded = true }
    page.on('download', onDl)
    await page.getByRole('button', { name: 'Compartir tabla' }).first().click()
    const t0 = Date.now()
    while (Date.now() - t0 < 20000 && !downloaded && !(await fail.isVisible().catch(() => false))) await page.waitForTimeout(100)
    page.off('download', onDl)
    return downloaded ? 'PNG downloaded' : (await fail.isVisible()) ? 'FAILED (No se pudo generar)' : 'no result'
  }
  const out = []
  if (goOfflineFirst) { await ctx.setOffline(true); out.push('offline: ' + await share()); await ctx.setOffline(false); await page.waitForTimeout(1000) }
  out.push('online: ' + await share())
  out.push('online again: ' + await share())
  await ctx.close()
  return out.join(' | ')
}
console.log('control session (never offline):', await session(false))
console.log('session that tried once offline:', await session(true))
await b.close()
