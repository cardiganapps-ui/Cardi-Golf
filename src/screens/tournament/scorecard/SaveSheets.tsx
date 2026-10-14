/** The questions «Guardar hoyo» may ask before it saves (§9.3): untouched defaults, unusual values, the snake's tiebreak. */
import { memo } from 'react'
import { Sheet } from '../../../components/ui'
import { t } from '../../../i18n/es-MX'

const S = t.card

/**
 * «¿Quién embocó al último?»: two or more at the snake's threshold on this hole (§5.6). An answer saves the hole
 * with it; «No sabemos» saves the scores now and the question waits for the Comité, never a guess (UX-08).
 */
export const TiebreakSheet = memo(function TiebreakSheet(p: {
  candidates: readonly string[] | null
  named: ReadonlyArray<{ id: string; name: string }>
  threshold: number
  busy: boolean
  onAnswer: (lastHoled: string | undefined) => void
  onClose: () => void
}) {
  return (
    <Sheet open={!!p.candidates} onClose={p.onClose} title={S.whoHoledLast}>
      <div className="stack">
        <p className="help">{S.whoHoledLastHint(p.threshold)}</p>
        {p.candidates?.map((id) => {
          const name = p.named.find((x) => x.id === id)?.name
          if (name === undefined) return null
          return (
            <button key={id} type="button" className="btn btn--secondary btn--block" disabled={p.busy} onClick={() => p.onAnswer(id)}>
              {name}
            </button>
          )
        })}
        {/* Nobody remembers: the scores go in now and the question waits for the Comité, never a guess (UX-08). */}
        <button type="button" className="btn btn--ghost btn--block" disabled={p.busy} onClick={() => p.onAnswer(undefined)}>
          {S.whoHoledLastUnknown}
        </button>
        <p className="help">{S.whoHoledLastUnknownHint}</p>
      </div>
    </Sheet>
  )
})

/** Nothing touched on a hole nobody played, seconds after the last save: a double tap, or did all of them make par? */
export const DefaultsSheet = memo(function DefaultsSheet(p: { open: boolean; hole: number; onBack: () => void; onConfirm: () => void }) {
  return (
    <Sheet open={p.open} onClose={p.onBack} title={S.allDefaultsTitle(p.hole)}>
      <div className="stack">
        <p className="help">{S.allDefaultsHint}</p>
        <div className="row">
          <button className="btn btn--secondary" type="button" onClick={p.onBack}>
            {S.allDefaultsBack}
          </button>
          <button className="btn btn--primary grow" type="button" onClick={p.onConfirm}>
            {S.allDefaultsConfirm}
          </button>
        </div>
      </div>
    </Sheet>
  )
})

/** Strokes of 10 or more or putts of 5 or more: «¿Seguro?», one line each, before the hole saves. */
export const UnusualSheet = memo(function UnusualSheet(p: { lines: readonly string[] | null; onFix: () => void; onConfirm: () => void }) {
  return (
    <Sheet open={!!p.lines} onClose={p.onFix} title={S.weirdTitle}>
      <div className="stack">
        <ul className="small">
          {p.lines?.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
        <div className="row">
          <button className="btn btn--secondary" type="button" onClick={p.onFix}>
            {S.weirdFix}
          </button>
          <button className="btn btn--primary grow" type="button" onClick={p.onConfirm}>
            {S.weirdConfirm}
          </button>
        </div>
      </div>
    </Sheet>
  )
})
