/**
 * Share cards (§9.11): render a DOM node to a PNG with html-to-image and hand
 * it to the Web Share API (files), falling back to a download.
 */
import { toBlob } from 'html-to-image'
import { cssVar } from './tokens'

export async function shareNodeAsImage(node: HTMLElement, filename: string, title: string, text?: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  // Fonts still loading would render as fallbacks in the image.
  await document.fonts?.ready
  const blob = await toBlob(node, { pixelRatio: 2, cacheBust: true, backgroundColor: getComputedStyle(node).backgroundColor || cssVar('--bg') })
  if (!blob) throw new Error('no image')
  const file = new File([blob], filename, { type: 'image/png' })
  if (typeof navigator !== 'undefined' && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title, text })
      return 'shared'
    } catch (e) {
      // The user closed the share sheet: nothing to do.
      if (e instanceof Error && e.name === 'AbortError') return 'cancelled'
      // iOS refuses a share that is not directly inside the tap (the render took too long): give the file instead.
      if (!(e instanceof Error && e.name === 'NotAllowedError')) throw e
    }
  }
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
