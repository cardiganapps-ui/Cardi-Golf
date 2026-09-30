import { chromium } from 'playwright-core'
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const ctx = await b.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block' })
const p = await ctx.newPage()
await p.goto('http://127.0.0.1:4173/t/_/full12-live', { waitUntil: 'domcontentloaded' })
await p.waitForTimeout(1200)
const q = () => p.evaluate(() => ({ coarse: matchMedia('(pointer: coarse)').matches, fine: matchMedia('(pointer: fine)').matches, hoverNone: matchMedia('(hover: none)').matches, anyCoarse: matchMedia('(any-pointer: coarse)').matches, btnH: [...document.querySelectorAll('.btn--sm')].map(b => Math.round(b.getBoundingClientRect().height)) }))
console.log('default', JSON.stringify(await q()))
const cdp = await ctx.newCDPSession(p)
try { await cdp.send('Emulation.setEmitTouchEventsForMouse', { enabled: true, configuration: 'mobile' }); console.log('emit mobile', JSON.stringify(await q())) } catch (e) { console.log('ERR1', e.message) }
try { await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'pointer', value: 'coarse' }, { name: 'hover', value: 'none' }] }); console.log('emulatedMedia', JSON.stringify(await q())) } catch (e) { console.log('ERR2', e.message) }
await b.close()
