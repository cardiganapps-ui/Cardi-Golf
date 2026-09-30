import { launch, close, newPage, go, EV } from './lib.mjs'
import { readFileSync, writeFileSync } from 'node:fs'
await launch()
const p = await newPage('laptop')
await go(p, '/t/_/full12-live/imprimir')
await p.pdf({ path: `${EV}/print-full12-live.pdf`, preferCSSPageSize: true, printBackground: true })
await p.pdf({ path: `${EV}/print-full12-live-a4-portrait.pdf`, format: 'A4', printBackground: true })
// Render with pdf.js from cdnjs inside Chromium.
const v = await newPage('laptop')
await v.setContent('<html><body style="margin:0;background:#888"></body></html>')
await v.addScriptTag({ url: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js' })
for (const name of ['print-full12-live.pdf', 'print-full12-live-a4-portrait.pdf']) {
  const b64 = readFileSync(`${EV}/${name}`).toString('base64')
  const info = await v.evaluate(async (b64) => {
    const pdfjsLib = window['pdfjs-dist/build/pdf']
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
    const doc = await pdfjsLib.getDocument({ data: bytes }).promise
    document.body.innerHTML = ''
    const out = []
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i)
      const vp1 = page.getViewport({ scale: 1 })
      const vp = page.getViewport({ scale: 1.4 })
      const c = document.createElement('canvas')
      c.width = vp.width; c.height = vp.height
      c.style.display = 'block'; c.style.margin = '8px'
      document.body.appendChild(c)
      await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise
      const tc = await page.getTextContent()
      const txt = tc.items.map((it) => it.str).join(' ')
      out.push({ page: i, sizePt: `${Math.round(vp1.width)}x${Math.round(vp1.height)}`, dots: (txt.match(/•/g) || []).length, head: txt.slice(0, 90) })
    }
    return { pages: doc.numPages, out }
  }, b64)
  console.log(name, JSON.stringify(info, null, 1))
  await v.waitForTimeout(300)
  const h = await v.evaluate(() => document.body.scrollHeight)
  await v.setViewportSize({ width: 1440, height: Math.min(h, 4000) })
  await v.screenshot({ path: `${EV}/${name.replace('.pdf', '')}-render.png`, fullPage: true })
}
await close()
