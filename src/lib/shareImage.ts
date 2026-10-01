/**
 * Share cards (§9.11): render a DOM node to a PNG with html-to-image and hand
 * it to the Web Share API (files), falling back to a download.
 *
 * PWA-04: html-to-image fetches every font and image itself, appends a
 * cache-busting `?<time>` (a precache miss, so it failed offline) and keeps a
 * failure in a module cache for the rest of the session. So it fetches
 * nothing here: the card's fonts (Latin subset of the families it uses) and
 * images are inlined as data URLs first, through the service worker's
 * precache, and only successes are remembered. A file that cannot be read
 * leaves that face or image out of this render only.
 */
import { toBlob } from 'html-to-image'
import { cssVar } from './tokens'

export type ShareResult = 'shared' | 'downloaded' | 'cancelled'
type Load = (url: string) => Promise<string>

/** Data URLs that loaded, by absolute URL. A failure is never stored, so the next attempt tries again. */
const inlined = new Map<string, string>()

async function fetchAsDataUrl(url: string): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  const blob = await res.blob()
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error ?? new Error('read failed'))
    reader.readAsDataURL(blob)
  })
}

async function inline(url: string, load: Load): Promise<string> {
  const hit = inlined.get(url)
  if (hit) return hit
  const data = await load(url)
  inlined.set(url, data)
  return data
}

export interface PageFontFace {
  family: string
  /** The rule as the stylesheet has it. */
  cssText: string
  /** Absolute URL of the first `src`. */
  url: string
  unicodeRange: string
}

const unquote = (s: string) => s.trim().replace(/^["']|["']$/g, '').toLowerCase()

/** Every @font-face rule the page has loaded. */
export function pageFontFaces(doc: Document = document): PageFontFace[] {
  const out: PageFontFace[] = []
  for (const sheet of Array.from(doc.styleSheets)) {
    let rules: CSSRuleList
    try {
      rules = sheet.cssRules
    } catch {
      continue // a cross-origin sheet: not ours
    }
    for (const rule of Array.from(rules)) {
      if (!(rule instanceof CSSFontFaceRule)) continue
      const src = /url\((["']?)([^"')]+)\1\)/.exec(rule.style.getPropertyValue('src'))?.[2]
      if (!src) continue
      out.push({
        family: unquote(rule.style.getPropertyValue('font-family')),
        cssText: rule.cssText,
        url: new URL(src, sheet.href ?? doc.baseURI).href,
        unicodeRange: rule.style.getPropertyValue('unicode-range'),
      })
    }
  }
  return out
}

/** The font families the node and its children ask for. */
export function familiesIn(node: HTMLElement): Set<string> {
  const used = new Set<string>()
  for (const el of [node, ...Array.from(node.querySelectorAll<HTMLElement>('*'))]) {
    for (const f of getComputedStyle(el).fontFamily.split(',')) used.add(unquote(f))
  }
  return used
}

/** Whether a unicode-range covers basic Latin («A»): the Spanish text, digits and $, without the other subsets. */
export function coversLatin(range: string): boolean {
  if (!range.trim()) return true
  return range.split(',').some((part) => {
    const m = /U\+([0-9a-f?]+)(?:-([0-9a-f]+))?/i.exec(part.trim())
    if (!m) return false
    const lo = parseInt(m[1]!.replace(/\?/g, '0'), 16)
    const hi = m[2] ? parseInt(m[2], 16) : parseInt(m[1]!.replace(/\?/g, 'f'), 16)
    return lo <= 0x41 && 0x41 <= hi
  })
}

/** The @font-face CSS for the card, every file inlined. Faces whose file did not load are left out of this render. */
export async function fontEmbedCss(faces: PageFontFace[], families: Set<string>, load: Load = fetchAsDataUrl): Promise<string> {
  const wanted = faces.filter((f) => families.has(f.family) && coversLatin(f.unicodeRange))
  const css = await Promise.all(
    wanted.map(async (f) => {
      try {
        const data = await inline(f.url, load)
        return f.cssText.replace(/src:[^;]+;?/, `src: url("${data}");`)
      } catch {
        return ''
      }
    }),
  )
  return css.filter(Boolean).join('\n')
}

/** Swaps every image in the node for a data URL; one that cannot be read is hidden for this render. Returns the undo. */
export async function inlineImages(node: HTMLElement, load: Load = fetchAsDataUrl): Promise<() => void> {
  const undo: Array<() => void> = []
  await Promise.all(
    Array.from(node.querySelectorAll('img')).map(async (img) => {
      const src = img.currentSrc || img.src
      if (!src || src.startsWith('data:')) return
      try {
        const data = await inline(src, load)
        const before = img.getAttribute('src')
        img.src = data
        undo.push(() => before != null && img.setAttribute('src', before))
        await img.decode().catch(() => undefined)
      } catch {
        const before = img.style.visibility
        img.style.visibility = 'hidden'
        undo.push(() => (img.style.visibility = before))
      }
    }),
  )
  return () => undo.forEach((u) => u())
}

export async function renderNodeToPng(node: HTMLElement): Promise<Blob> {
  // Fonts still loading would render as fallbacks in the image.
  await document.fonts?.ready
  const [fontCss, restore] = await Promise.all([fontEmbedCss(pageFontFaces(), familiesIn(node)), inlineImages(node)])
  try {
    // Nothing left for html-to-image to fetch: no cache-busting, no session cache of failures.
    const blob = await toBlob(node, { pixelRatio: 2, cacheBust: false, fontEmbedCSS: fontCss, backgroundColor: getComputedStyle(node).backgroundColor || cssVar('--bg') })
    if (!blob) throw new Error('no image')
    return blob
  } finally {
    restore()
  }
}

function download(blob: Blob, filename: string): ShareResult {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
  return 'downloaded'
}

async function share(file: File, title: string, text: string | undefined, needsTap?: (again: () => Promise<ShareResult>) => void): Promise<ShareResult> {
  if (typeof navigator !== 'undefined' && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title, text })
      return 'shared'
    } catch (e) {
      // The user closed the share sheet: nothing to do.
      if (e instanceof Error && e.name === 'AbortError') return 'cancelled'
      if (!(e instanceof Error && e.name === 'NotAllowedError')) throw e
      // iOS shares only inside the tap, and the render outlasted it: the image is
      // ready, so a second tap shares it (to WhatsApp, not a file in Descargas).
      if (needsTap) {
        needsTap(() => share(file, title, text))
        return 'cancelled'
      }
    }
  }
  return download(file, file.name)
}

/**
 * Renders the node and shares it. `needsTap` receives a function to call from a
 * second tap when the browser refused to share outside the first one.
 */
export async function shareNodeAsImage(node: HTMLElement, filename: string, title: string, text?: string, needsTap?: (again: () => Promise<ShareResult>) => void): Promise<ShareResult> {
  const blob = await renderNodeToPng(node)
  return share(new File([blob], filename, { type: 'image/png' }), title, text, needsTap)
}

/** Tests only. */
export const _shareTest = { reset: () => inlined.clear(), share }
