import { it } from 'vitest'
import { getFixture } from '/home/user/Cardi-Golf/src/dev/fixtures'
import { gzipSync } from 'node:zlib'
it('snapshot payload size', () => {
  for (const name of ['full12-finished', 'large60']) {
    const s = getFixture(name)!.snapshot
    const json = JSON.stringify(s)
    const scores = JSON.stringify(s.scores)
    console.log(`${name}: snapshot JSON ${(json.length / 1024).toFixed(0)} KiB (gzip ${(gzipSync(json).length / 1024).toFixed(0)} KiB); scores alone ${(scores.length / 1024).toFixed(0)} KiB, ${s.scores.length} rows`)
  }
})
