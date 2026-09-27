/**
 * Share cards (§9.11): render a DOM node to a PNG with html-to-image and hand
 * it to the Web Share API (files), falling back to a download.
 */
import { toBlob } from 'html-to-image'

export async function shareNodeAsImage(node: HTMLElement, filename: string, title: string, text?: string): Promise<'shared' | 'downloaded'> {
  const blob = await toBlob(node, { pixelRatio: 2, cacheBust: true, backgroundColor: getComputedStyle(node).backgroundColor || '#F7F1E3' })
  if (!blob) throw new Error('no image')
  const file = new File([blob], filename, { type: 'image/png' })
  if (typeof navigator !== 'undefined' && navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title, text })
    return 'shared'
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
