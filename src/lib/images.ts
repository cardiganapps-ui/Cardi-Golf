/**
 * Client-side image prep: downscale before upload (avatars, logos, scorecard
 * photos). HEIC is decoded by Safari itself when drawn on a canvas; other
 * browsers get the original bytes.
 *
 * PERF-16: the format follows what the picture holds. JPEG has no alpha, so it
 * is chosen only for a picture with nothing transparent in it (a camera photo,
 * a scan): a transparent logo used to come out on a black square. Anything with
 * transparency is WebP, which keeps it, or PNG where the browser can't encode
 * WebP (Safari's canvas hands back a PNG when asked for WebP, an older browser
 * may hand back nothing): the blob's own type says which, never the type asked.
 */
import { t } from '../i18n/es-MX'
import { UserError } from './humanError'

export interface PreparedImage {
  blob: Blob
  /** The blob's own type: what Storage serves it as. */
  type: string
  /** The size it was encoded at; null when the original went up as it was (a format the browser can't draw). */
  width: number | null
  height: number | null
}

export interface PrepOptions {
  /** The box the picture is scaled down to fit, in pixels. It is never scaled up. */
  maxWidth: number
  maxHeight: number
  quality?: number
  /** Flatten onto this color first, so the result has no transparency (a scorecard for the reader, where a transparent ground could read as black). */
  background?: string
  /**
   * A byte budget: an encoding over it is redone smaller, never below `minSide`
   * on its longer side. It matters where WebP is not available and a
   * transparent picture is a PNG, several times WebP's size.
   */
  maxBytes?: number
  minSide?: number
}

/** The size that fits the box, keeping the aspect ratio. Never larger than the source. */
export function fitWithin(
  width: number,
  height: number,
  maxWidth: number,
  maxHeight: number,
): { width: number; height: number } {
  const scale = Math.min(1, maxWidth / width, maxHeight / height)
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

/** Whether any pixel of RGBA data is less than fully opaque. */
export function hasTransparency(rgba: ArrayLike<number>): boolean {
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i]! < 255) return true
  return false
}

/** The encodings to try, in order. A picture with transparency never gets JPEG. */
export function encodingsFor(transparent: boolean): string[] {
  return transparent ? ['image/webp', 'image/png'] : ['image/jpeg']
}

/** The part of a canvas `encode` needs, so a test can hand in one that behaves like Safari's. */
export interface Encodable {
  toBlob(callback: (blob: Blob | null) => void, type?: string, quality?: number): void
}

const toBlob = (canvas: Encodable, type: string, quality: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality))

/**
 * Encodes the canvas in the first format of `encodingsFor` the browser really
 * produced. Asked for a type it can't encode, a browser gives a PNG (the spec's
 * fallback) or nothing: the blob's type decides, so a WebP request that came
 * back PNG is taken as the PNG it is. With transparency, only WebP or PNG is
 * accepted.
 */
export async function encode(canvas: Encodable, transparent: boolean, quality: number): Promise<Blob> {
  const keepsAlpha = ['image/webp', 'image/png']
  for (const type of encodingsFor(transparent)) {
    const blob = await toBlob(canvas, type, quality)
    if (!blob || blob.size === 0) continue
    if (!transparent || keepsAlpha.includes(blob.type)) return blob
  }
  throw new UserError(t.errors.image)
}

/** Types whose files can carry transparency: only those are scanned for it. */
const MAY_HAVE_ALPHA = /^image\/(png|apng|webp|gif|avif|svg\+xml)$/i

export async function prepareImage(file: File, opts: PrepOptions): Promise<PreparedImage> {
  const original: PreparedImage = { blob: file, type: file.type || 'image/jpeg', width: null, height: null }
  if (!file.type.startsWith('image/') && !/\.heic$/i.test(file.name)) return { ...original, type: file.type }
  const quality = opts.quality ?? 0.86
  try {
    const bitmap = await createImageBitmap(file)
    let { width, height } = fitWithin(bitmap.width, bitmap.height, opts.maxWidth, opts.maxHeight)
    for (let attempt = 0; ; attempt++) {
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')!
      if (opts.background) {
        ctx.fillStyle = opts.background
        ctx.fillRect(0, 0, width, height)
      }
      ctx.drawImage(bitmap, 0, 0, width, height)
      const transparent =
        !opts.background &&
        MAY_HAVE_ALPHA.test(file.type) &&
        hasTransparency(ctx.getImageData(0, 0, width, height).data)
      const blob = await encode(canvas, transparent, quality)
      const longer = Math.max(width, height)
      const floor = opts.minSide ?? 0
      if (!opts.maxBytes || blob.size <= opts.maxBytes || attempt >= 3 || longer <= floor) {
        bitmap.close?.()
        return { blob, type: blob.type, width, height }
      }
      // Bytes go with the area: shrink both sides by the square root of the excess, and a little more to land under it.
      const scale = Math.max(floor, Math.round(longer * Math.sqrt(opts.maxBytes / blob.size) * 0.95)) / longer
      width = Math.max(1, Math.round(width * scale))
      height = Math.max(1, Math.round(height * scale))
    }
  } catch {
    return original
  }
}

/** A square box, as avatars and the other photos want. */
export async function downscaleImage(
  file: File,
  maxSide = 1600,
  quality = 0.86,
): Promise<{ blob: Blob; type: string }> {
  const r = await prepareImage(file, { maxWidth: maxSide, maxHeight: maxSide, quality })
  return { blob: r.blob, type: r.type }
}

/** The file extension a Storage path takes for a type. */
export function extensionFor(type: string): string {
  if (type === 'image/png') return 'png'
  if (type === 'image/webp') return 'webp'
  if (type === 'image/gif') return 'gif'
  if (type === 'application/pdf') return 'pdf'
  return 'jpg'
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve((typeof r.result === 'string' ? r.result : '').split(',')[1] ?? '')
    r.onerror = () => reject(r.error ?? new Error('read'))
    r.readAsDataURL(blob)
  })
}
