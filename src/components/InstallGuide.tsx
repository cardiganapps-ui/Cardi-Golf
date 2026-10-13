/**
 * Installing the app (§9.1, PWA-08), where players are:
 * - `InstallCard` on En vivo, Home and Mi Polo until the phone has the app. It shows this phone's steps
 *   (an iPhone's, or Android's one-tap «Instalar» when Chrome offers it), never a laptop's, never inside
 *   the installed app. «Ahora no» hides it for a week, «Ya la tengo» for good.
 * - `InstallFirst` on Entrar in an iPhone's browser, before the PIN: the installed app keeps nothing of
 *   the browser's, so a player who installs after entering enters twice.
 * - `InstallRow` in Más, always: the card could be hidden, and nothing brought the steps back.
 * - `CaptureFromIcon` on the Tarjeta in an iPhone's browser: what is saved there stays in that browser,
 *   apart from the installed app (a link from WhatsApp always opens Safari).
 * - `InstallSteps`: the steps themselves.
 */
import { useState } from 'react'
import { t } from '../i18n/es-MX'
import { useOutbox } from '../data/outbox'
import { devicePlatform, installNow, isStandalone, markInstalled, saidInstalled, useInstallOffer, type DevicePlatform } from '../lib/install'
import { IconHome, IconShare } from './icons'
import { Sheet } from './ui'
import styles from './InstallGuide.module.css'

/** «Ahora no» until then. */
const LATER = 'cardi-golf:install-later'
const WEEK = 7 * 24 * 60 * 60 * 1000

function laterActive(): boolean {
  try {
    return Number(localStorage.getItem(LATER) ?? 0) > Date.now()
  } catch {
    return false
  }
}

/** This phone's way to install; on anything else, both phones' steps, each named. */
export function InstallSteps({ platform }: { platform: DevicePlatform }) {
  const offer = useInstallOffer((s) => s.offer)
  if (platform === 'android') {
    // Chrome offered the install: one tap. Otherwise its menu, which every Android browser has.
    return offer ? (
      <button className="btn btn--primary" type="button" onClick={() => void installNow()}>
        {t.install.installButton}
      </button>
    ) : (
      <p className={styles.step}>{t.install.android}</p>
    )
  }
  if (platform === 'ios') {
    // Safari's Share glyph beside the words: «el cuadro con la flecha» is quicker seen than read.
    return (
      <p className={`${styles.step} ${styles.withGlyph}`}>
        <IconShare className={styles.glyph} size={20} />
        <span>{t.install.ios}</span>
      </p>
    )
  }
  return (
    <dl className={styles.both}>
      <dt>{t.install.onIphone}</dt>
      <dd>{t.install.ios}</dd>
      <dt>{t.install.onAndroid}</dt>
      <dd>{t.install.android}</dd>
    </dl>
  )
}

/** Where players arrive: this phone's steps until it has the app. */
export function InstallCard() {
  const installed = useInstallOffer((s) => s.installed)
  const [hidden, setHidden] = useState(() => laterActive() || saidInstalled())
  const platform = devicePlatform()
  if (hidden || installed || isStandalone() || platform === 'other') return null

  function later() {
    try {
      localStorage.setItem(LATER, String(Date.now() + WEEK))
    } catch {
      /* private mode: just hide for this visit */
    }
    setHidden(true)
  }
  function have() {
    markInstalled()
    setHidden(true)
  }

  return (
    <section className={styles.guide} aria-label={t.install.title}>
      <h2>{t.install.title}</h2>
      <p className="help">{t.install.why}</p>
      <InstallSteps platform={platform} />
      <div className={styles.actions}>
        <button className="btn btn--ghost btn--sm" type="button" onClick={later}>
          {t.install.later}
        </button>
        <button className="btn btn--ghost btn--sm" type="button" onClick={have}>
          {t.install.done}
        </button>
      </div>
    </section>
  )
}

/** Entrar in an iPhone's browser: install first, and enter from the icon; or, if it is installed, go there. */
export function InstallFirst() {
  const [open, setOpen] = useState(false)
  if (isStandalone() || devicePlatform() !== 'ios') return null
  if (saidInstalled()) return <p className="help">{t.install.alreadyIos}</p>
  return (
    <div className={styles.first}>
      <p className="help">
        {t.install.iosFirst}{' '}
        <button className={styles.inline} type="button" aria-expanded={open} onClick={() => setOpen(!open)}>
          {t.install.iosFirstHow}
        </button>
      </p>
      {open && <InstallSteps platform="ios" />}
    </div>
  )
}

/** Más: the steps, whatever the card was told. Nothing to show inside the installed app. */
export function InstallRow({ className }: { className?: string }) {
  const [open, setOpen] = useState(false)
  if (isStandalone()) return null
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        <IconHome /> {t.install.howTo}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={t.install.howTo}>
        <p className="help">{t.install.why}</p>
        <InstallSteps platform={devicePlatform()} />
      </Sheet>
    </>
  )
}

/**
 * The Tarjeta in an iPhone's browser: a player with the app installed should capture there (PWA-09). Holes
 * this browser still has to send are said out loud: the installed app cannot see them, so they go up only
 * from here.
 */
export function CaptureFromIcon() {
  const held = useOutbox((s) => s.pendingHoles)
  if (isStandalone() || devicePlatform() !== 'ios') return null
  if (held > 0) {
    return (
      <p className={styles.held} role="status">
        {t.install.iosCardHeld(held)}
      </p>
    )
  }
  return <p className="help">{t.install.iosCard}</p>
}
