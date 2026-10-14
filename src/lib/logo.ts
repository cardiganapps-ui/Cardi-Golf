/**
 * A tournament's logo (PERF-01). It is stored as one rendition sized for its
 * largest use, not as the file the organizer picked: the biggest slots are the
 * ceremony (up to 120 px tall on a 2× screen) and the TV (9vh, about 97 px on a
 * 1080-line screen, twice that at 2×); a phone's header (28 px), Entrar (40 px),
 * the Comité's preview (64 px), the share card (56 px at its 2×) and the
 * printed card (44 px at 300 dpi) all fit inside it at 3×. The box is three
 * times as wide as it is tall, so a logo up to 3:1 fills a slot sized by its
 * height at full sharpness. `src/lib/logo.test.ts` holds every slot's CSS to
 * this box.
 *
 * The rendition's size is in its file name (`<tid>/logo-222x240-<time>.webp`),
 * so every <img> of it gets width and height and nothing shifts while it loads;
 * `tournaments.logo_url` keeps meaning «the logo's URL», so older bundles show
 * the rendition as they showed the original. A URL without a size (a logo
 * uploaded before this, or seeded straight into Storage) is shown as it is,
 * and the Comité is offered to process it again.
 */
import { extensionFor, prepareImage, type PreparedImage } from './images'

/** The rendition's box, in pixels. */
export const LOGO_BOX = { width: 720, height: 240 } as const
/**
 * Where the browser can't encode WebP (Safari), a transparent logo is a PNG,
 * several times WebP's size: over this budget it is redone smaller, never
 * under LOGO_MIN_SIDE on its longer side (Entrar's 40 px at 3× fits in it).
 */
export const LOGO_MAX_BYTES = 64_000
export const LOGO_MIN_SIDE = 160

/** A rendition's URL: its size, then a time, so each upload is a new file a cache can keep for a year. */
const RENDITION = /\/logo-(\d+)x(\d+)-\d+\.(?:webp|png|jpg|gif)(?:[?#]|$)/

export function prepareLogo(file: File): Promise<PreparedImage> {
  return prepareImage(file, { maxWidth: LOGO_BOX.width, maxHeight: LOGO_BOX.height, quality: 0.85, maxBytes: LOGO_MAX_BYTES, minSide: LOGO_MIN_SIDE })
}

/**
 * The Storage path for a prepared logo. A new name every time: the old file
 * stays, since a duplicated tournament (and the history) may still point at it.
 * A logo the browser could not redraw goes up as it came, with no size.
 */
export function logoPath(tournamentId: string, prep: Pick<PreparedImage, 'type' | 'width' | 'height'>, stamp = Date.now()): string {
  const ext = extensionFor(prep.type)
  return prep.width && prep.height ? `${tournamentId}/logo-${prep.width}x${prep.height}-${stamp}.${ext}` : `${tournamentId}/logo-${stamp}.${ext}`
}

/** The rendition's size from its URL; null for a logo stored before renditions (shown as it is). */
export function logoSize(url: string | null | undefined): { width: number; height: number } | null {
  const m = url ? RENDITION.exec(url) : null
  if (!m) return null
  const width = Number(m[1])
  const height = Number(m[2])
  return width > 0 && height > 0 ? { width, height } : null
}

/** A rendition never expires: its name changes with every upload. */
export const LOGO_CACHE_SECONDS = '31536000'
