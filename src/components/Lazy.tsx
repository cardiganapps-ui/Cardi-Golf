/**
 * The Suspense boundary for a screen loaded when first needed (PERF-02, MOT-22).
 *
 * - Before any screen has shown, it is the boot screen index.html paints (the same paper, mark and words), so
 *   a first open goes from the launch image to the app with nothing in between while the route's chunk loads.
 * - After that it waits: nothing for `LATE_MS`, then the skeleton rows. A screen that loads quickly (from the
 *   precache, or preloaded on intent) shows no placeholder at all; the skeleton used to flash for a few hundred
 *   ms on every first visit to Estadísticas, the TV or a Comité section.
 */
import { Suspense, useEffect, useLayoutEffect, useState, type ReactNode } from 'react'
import { t } from '../i18n/es-MX'
import { assetUrl } from '../lib/assetUrl'
import { Spinner } from './ui'
import { LATE_MS, markScreenShown, screenShown } from './lazyState'
import styles from './Lazy.module.css'

export function Lazy({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={screenShown() ? <Late /> : <Boot />}>
      <Shown>{children}</Shown>
    </Suspense>
  )
}

/** Marks that a screen made it to the page: its layout effect runs only once the boundary shows its content. */
function Shown({ children }: { children: ReactNode }) {
  useLayoutEffect(markScreenShown, [])
  return children
}

function Late() {
  const [late, setLate] = useState(false)
  useEffect(() => {
    const id = setTimeout(() => setLate(true), LATE_MS)
    return () => clearTimeout(id)
  }, [])
  return late ? <Spinner /> : null
}

/** index.html's boot screen, drawn by the app until the first screen's chunk is in. */
function Boot() {
  return (
    <div className={styles.boot} role="status">
      <img className={styles.mark} src={assetUrl('/brand/boot-mark.png')} width={120} height={120} alt="Polo" />
      <p>{t.common.loading}</p>
    </div>
  )
}
