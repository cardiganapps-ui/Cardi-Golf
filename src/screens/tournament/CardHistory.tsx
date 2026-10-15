/**
 * A card's history, in the player's sheet (TRUST-14, 0062 `card_history`): each hole that changed after its first
 * capture, or that the Comité decided, with every value it held, who wrote it and when, and the Comité's reason.
 * Asked for with a tap, since only the server keeps it; the card itself (and the Comité's marks on it) never waits
 * for it. Not on a link to watch, which asks nothing of anyone's, nor on the in-memory fixtures, which have no server.
 */
import { useRef, useState } from 'react'
import { t } from '../../i18n/es-MX'
import { cardHistory, holeTrails, type CardStep, type HoleTrail } from '../../data/cardHistory'
import { useViewFocus } from '../../components/viewFocus'
import { historyWhy } from '../../lib/comiteReasons'
import { humanError } from '../../lib/humanError'
import { localWhen } from '../../lib/localWhen'
import styles from './PlayerSheet.module.css'

const H = t.card.history

type Shown = { kind: 'idle' } | { kind: 'loading' } | { kind: 'shown'; trails: HoleTrail[] } | { kind: 'unavailable' } | { kind: 'failed'; said: string }

/** What a step left on the hole, in words: its strokes and putts, a pick-up, or nothing (the Comité deleted it). */
function what(s: CardStep): string {
  const v = s.after
  if (!v) return H.deleted
  return v.pickedUp ? H.pickedUp(v.putts) : H.value(v.strokes, v.putts)
}

/** Who wrote it: the Comité when it decided the hole, or nobody's player wrote it (an organizer who plays nobody). */
function who(s: CardStep): string {
  return s.comite || !s.by ? H.comite : s.by
}

export function CardHistory({ tournamentId, playerId, timeZone }: { tournamentId: string; playerId: string; timeZone: string }) {
  const [shown, setShown] = useState<Shown>({ kind: 'idle' })
  const heading = useRef<HTMLHeadingElement>(null)
  // The button that asked goes with the view: the person lands on the history's heading, never on the page.
  useViewFocus(shown.kind, () => heading.current)

  const load = async () => {
    setShown({ kind: 'loading' })
    try {
      const steps = await cardHistory(tournamentId, playerId)
      setShown(steps === 'unavailable' ? { kind: 'unavailable' } : { kind: 'shown', trails: holeTrails(steps) })
    } catch (e) {
      setShown({ kind: 'failed', said: humanError(e) })
    }
  }

  const days = shown.kind === 'shown' ? [...new Set(shown.trails.map((h) => h.round))] : []
  return (
    <section className={styles.section} aria-busy={shown.kind === 'loading'}>
      <div className={styles.sectionHead}>
        <h3 ref={heading}>{H.title}</h3>
      </div>
      {(shown.kind === 'idle' || shown.kind === 'loading') && (
        <>
          <p className="help">{H.hint}</p>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => void load()} disabled={shown.kind === 'loading'}>
            {shown.kind === 'loading' ? H.loading : H.show}
          </button>
        </>
      )}
      {shown.kind === 'unavailable' && <p className="help">{H.unavailable}</p>}
      {shown.kind === 'failed' && (
        <>
          <p className="help" role="alert">
            {shown.said}
          </p>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => void load()}>
            {t.common.retry}
          </button>
        </>
      )}
      {shown.kind === 'shown' && shown.trails.length === 0 && <p className="help">{H.none}</p>}
      {days.map((day) => (
        <div key={day} className={styles.historyDay}>
          <h4 className="label">{t.round.day(day)}</h4>
          <ul className={styles.historyHoles}>
            {(shown.kind === 'shown' ? shown.trails : [])
              .filter((h) => h.round === day)
              .map((h) => (
                <li key={`${h.roundId}:${h.hole}`}>
                  <strong>{t.round.hole(h.hole)}</strong>
                  <ol className={styles.historySteps}>
                    {h.steps.map((s, i) => (
                      <li key={`${s.at}:${i}`}>{H.step(localWhen(s.at, timeZone), who(s), what(s), s.comite ? historyWhy(s.reason) : null)}</li>
                    ))}
                  </ol>
                </li>
              ))}
          </ul>
        </div>
      ))}
    </section>
  )
}
