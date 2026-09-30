#!/usr/bin/env node
// Usage: node compress-png.mjs <file.png> [...]  — rewrites each PNG in place as a palette PNG (much smaller).
import sharp from 'sharp'
import { readFileSync, writeFileSync, statSync } from 'node:fs'
let before = 0, after = 0
for (const f of process.argv.slice(2)) {
  const src = readFileSync(f)
  before += src.length
  const out = await sharp(src).png({ palette: true, quality: 85, compressionLevel: 9, effort: 8 }).toBuffer()
  const keep = out.length < src.length ? out : src
  writeFileSync(f, keep)
  after += keep.length
}
console.log(`compressed ${process.argv.length - 2} file(s): ${(before / 1024).toFixed(0)} KB -> ${(after / 1024).toFixed(0)} KB`)
