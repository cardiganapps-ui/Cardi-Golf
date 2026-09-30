import sharp from 'sharp'
const [src, dst, h] = process.argv.slice(2)
const img = sharp(src)
const m = await img.metadata()
await sharp(src).extract({ left: 0, top: 0, width: m.width, height: Math.min(Number(h), m.height) }).toFile(dst)
console.log('cropped', dst, m.width, 'x', Math.min(Number(h), m.height))
