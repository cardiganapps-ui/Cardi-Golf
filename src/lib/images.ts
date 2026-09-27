/**
 * Client-side image prep: downscale before upload (avatars, logos, scorecard
 * photos). HEIC is decoded by Safari itself when drawn on a canvas; other
 * browsers get the original bytes.
 */
export async function downscaleImage(file: File, maxSide = 1600, quality = 0.86): Promise<{ blob: Blob; type: string }> {
  if (!file.type.startsWith('image/') && !/\.heic$/i.test(file.name)) return { blob: file, type: file.type }
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
    const w = Math.round(bitmap.width * scale)
    const h = Math.round(bitmap.height * scale)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(bitmap, 0, 0, w, h)
    const keepPng = file.type === 'image/png' && scale === 1 && file.size < 400_000
    const type = keepPng ? 'image/png' : 'image/jpeg'
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo procesar la imagen'))), type, quality),
    )
    return { blob, type }
  } catch {
    return { blob: file, type: file.type || 'image/jpeg' }
  }
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '')
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })
}
