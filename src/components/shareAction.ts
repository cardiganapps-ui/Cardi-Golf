import { t } from '../i18n/es-MX'
import { shareNodeAsImage } from '../lib/shareImage'
import { toast } from './ui'

/**
 * Renders the card and shares it. When the browser shares only inside the tap
 * and the render outlasted it (iOS), the ready image waits in a toast: one more
 * tap on «Compartir» opens the share sheet.
 */
export async function shareCard(node: HTMLElement, filename: string, title: string, text?: string): Promise<void> {
  const failed = (e: unknown) => {
    if (!(e instanceof Error && e.name === 'AbortError')) toast(t.share.failed)
  }
  try {
    await shareNodeAsImage(node, filename, title, text, (again) => toast(t.share.saved, { label: t.share.shareNow, onClick: () => void again().catch(failed) }))
  } catch (e) {
    failed(e)
  }
}
