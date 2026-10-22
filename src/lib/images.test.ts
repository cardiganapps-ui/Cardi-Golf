/**
 * PERF-16: the image prep's choice of format. JPEG only for a picture with
 * nothing transparent; otherwise WebP, or PNG where the browser can't encode
 * WebP, decided by the blob the browser really produced. The browser half
 * (a real canvas on a transparent PNG) is e2e/fixtures/logo.spec.ts.
 */
import { describe, expect, it } from 'vitest'
import { encode, encodingsFor, extensionFor, fitWithin, hasTransparency, type Encodable } from './images'
import { UserError } from './humanError'

/** A canvas that encodes the types in `can` and answers anything else as `otherwise` does. */
function canvas(can: string[], otherwise: 'png' | 'null' | 'jpeg'): Encodable & { asked: string[] } {
  const asked: string[] = []
  return {
    asked,
    toBlob(cb, type = 'image/png') {
      asked.push(type)
      if (can.includes(type)) {
        cb(new Blob(['x'], { type }))
        return
      }
      if (otherwise === 'null') {
        cb(null)
        return
      }
      cb(new Blob(['x'], { type: otherwise === 'png' ? 'image/png' : 'image/jpeg' }))
    },
  }
}

describe('hasTransparency', () => {
  it('sees one pixel under full opacity', () => {
    expect(hasTransparency([0, 0, 0, 255, 9, 9, 9, 255])).toBe(false)
    expect(hasTransparency([0, 0, 0, 255, 9, 9, 9, 254])).toBe(true)
    expect(hasTransparency([0, 0, 0, 0])).toBe(true)
  })
})

describe('encodingsFor', () => {
  it('never offers JPEG for a picture with transparency', () => {
    expect(encodingsFor(true)).toEqual(['image/webp', 'image/png'])
    expect(encodingsFor(true)).not.toContain('image/jpeg')
    expect(encodingsFor(false)).toEqual(['image/jpeg'])
  })
})

describe('encode', () => {
  it('a browser that encodes WebP gives WebP for a transparent picture', async () => {
    const c = canvas(['image/webp', 'image/png', 'image/jpeg'], 'png')
    expect((await encode(c, true, 0.85)).type).toBe('image/webp')
    expect(c.asked).toEqual(['image/webp'])
  })

  it('Safari answers a WebP request with a PNG: the PNG is what is kept, by its own type', async () => {
    const c = canvas(['image/png', 'image/jpeg'], 'png')
    const blob = await encode(c, true, 0.85)
    expect(blob.type).toBe('image/png')
    expect(c.asked).toEqual(['image/webp'])
  })

  it('a browser that gives nothing for WebP is asked for a PNG', async () => {
    const c = canvas(['image/png', 'image/jpeg'], 'null')
    expect((await encode(c, true, 0.85)).type).toBe('image/png')
    expect(c.asked).toEqual(['image/webp', 'image/png'])
  })

  it('a blob without alpha is never taken for a transparent picture', async () => {
    const c = canvas(['image/jpeg'], 'jpeg')
    await expect(encode(c, true, 0.85)).rejects.toBeInstanceOf(UserError)
  })

  it('an opaque picture (a camera photo) stays JPEG', async () => {
    const c = canvas(['image/webp', 'image/png', 'image/jpeg'], 'png')
    expect((await encode(c, false, 0.86)).type).toBe('image/jpeg')
  })
})

describe('fitWithin', () => {
  it('scales into the box, keeping the shape, never up', () => {
    // The first tournament's patch, into the logo's box.
    expect(fitWithin(591, 640, 720, 240)).toEqual({ width: 222, height: 240 })
    expect(fitWithin(2000, 500, 720, 240)).toEqual({ width: 720, height: 180 })
    expect(fitWithin(100, 80, 720, 240)).toEqual({ width: 100, height: 80 })
  })
})

describe('extensionFor', () => {
  it('names the file by what it holds', () => {
    expect(extensionFor('image/webp')).toBe('webp')
    expect(extensionFor('image/png')).toBe('png')
    expect(extensionFor('image/jpeg')).toBe('jpg')
    expect(extensionFor('application/pdf')).toBe('pdf')
  })
})
