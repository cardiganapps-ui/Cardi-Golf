// What the Comité's logo upload does to assets/nacho-logo.png: run src/lib/images.ts downscaleImage (copied verbatim
// below, maxSide 800 as AdminTournament.tsx:116 calls it) in Chromium and inspect the output's format, size and corner pixel.
import { readFileSync, writeFileSync } from 'node:fs'
import { launch, E } from './perf-lib.mjs'
const png = readFileSync('/home/user/Cardi-Golf/assets/nacho-logo.png')
const b = await launch()
const page = await b.newPage()
await page.route('http://logo.test/**', (r) => r.fulfill({ status: 200, contentType: 'image/png', body: png }))
await page.route('http://logo.test/', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>t</title>' }))
await page.goto('http://logo.test/')
const res = await page.evaluate(async () => {
  const src = await (await fetch('http://logo.test/nacho-logo.png')).blob()
  const file = new File([src], 'nacho-logo.png', { type: 'image/png' })
  // --- verbatim from src/lib/images.ts:6-27 ---
  async function downscaleImage(file, maxSide = 1600, quality = 0.86) {
    if (!file.type.startsWith('image/') && !/\.heic$/i.test(file.name)) return { blob: file, type: file.type }
    try {
      const bitmap = await createImageBitmap(file)
      const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
      const w = Math.round(bitmap.width * scale)
      const h = Math.round(bitmap.height * scale)
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      ctx.drawImage(bitmap, 0, 0, w, h)
      const keepPng = file.type === 'image/png' && scale === 1 && file.size < 400_000
      const type = keepPng ? 'image/png' : 'image/jpeg'
      const blob = await new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('x'))), type, quality))
      return { blob, type }
    } catch {
      return { blob: file, type: file.type || 'image/jpeg' }
    }
  }
  // ---
  const px = async (blob) => {
    const bm = await createImageBitmap(blob)
    const c = document.createElement('canvas')
    c.width = bm.width
    c.height = bm.height
    const x = c.getContext('2d')
    x.drawImage(bm, 0, 0)
    return { w: bm.width, h: bm.height, corner: [...x.getImageData(2, 2, 1, 1).data] }
  }
  const out = await downscaleImage(file, 800)
  const dataUrl = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(out.blob) })
  return { inBytes: file.size, input: await px(file), outType: out.type, outBytes: out.blob.size, output: await px(out.blob), dataUrl }
})
writeFileSync(`${E}/logo-upload-output.jpg`, Buffer.from(res.dataUrl.split(',')[1], 'base64'))
delete res.dataUrl
console.log(JSON.stringify(res))
await b.close()
