import { useMemo, useState } from 'react'
import { t } from '../../i18n/es-MX'
import { Segmented, SiAbbr } from '../../components/primitives'
import { Field } from '../../components/ui'
import type { CourseDraft, CourseDraftTee } from '../../data/api'
import styles from './CourseEditor.module.css'
import { OptionalNumberField } from '../../components/NumberField'
import { blankTee, NOT_TYPED, untypedHoles, validateTee } from './courseCells'

const C = t.admin.courses

/** Parse pasted lines: pars, stroke indexes, optional yards. */
function parsePaste(text: string, holes: number): { par: number[]; si: number[]; yards: number[] | null } | null {
  const lines = text
    .split(/\n+/)
    .map((l) =>
      l
        .replace(/[^\d\s,;]/g, ' ')
        .split(/[\s,;]+/)
        .filter(Boolean)
        .map(Number),
    )
    .filter((l) => l.length >= holes)
  if (lines.length < 2) return null
  const pick = (l: number[]) => (l.length === holes + 1 || l.length === holes + 2 || l.length === holes + 3 ? l.slice(0, holes) : l.slice(0, holes))
  const par = pick(lines[0]!)
  const si = pick(lines[1]!)
  const yards = lines[2] ? pick(lines[2]) : null
  if (!par.every((p) => p >= 3 && p <= 6)) return null
  if (!si.every((s) => s >= 1 && s <= holes)) return null
  return { par, si, yards }
}

/** The tees live here (P1 20): adding and removing one is local state, nothing is re-synced from the parent during render. */
export function CourseEditor({ draft, notes, busy, onSave, onCancel, onEdit, onPasting }: { draft: CourseDraft; notes: string[]; busy: boolean; onSave: (d: CourseDraft) => void; onCancel: () => void; onEdit?: (d: CourseDraft) => void; onPasting?: (pending: boolean) => void }) {
  const [d, setDraftHere] = useState<CourseDraft>(draft)
  /** Every edit, and the caller hears of it (`onEdit`): its sheet asks before a stray tap discards the card (UX-15). */
  const setD = (next: CourseDraft) => {
    setDraftHere(next)
    onEdit?.(next)
  }
  const [teeIdx, setTeeIdx] = useState(0)
  const [paste, setPasteHere] = useState('')
  /** A card pasted and not applied yet is work too: the sheet asks before it goes (UX-15). */
  const setPaste = (text: string) => {
    setPasteHere(text)
    onPasting?.(text.trim() !== '')
  }
  const [pasteErr, setPasteErr] = useState<string | null>(null)
  const tee = d.tees[teeIdx] ?? d.tees[0]!
  const issues = useMemo(() => d.tees.flatMap((x) => validateTee(x).map((i) => `${x.name}: ${i}`)), [d])

  const setTee = (patch: Partial<CourseDraftTee>) => {
    const tees = [...d.tees]
    tees[teeIdx] = { ...tee, ...patch }
    setD({ ...d, tees })
  }
  const setHole = (i: number, patch: Partial<CourseDraftTee['holes'][number]>) => {
    const holes = [...tee.holes]
    holes[i] = { ...holes[i]!, ...patch }
    setTee({ holes })
  }
  function applyPaste() {
    const r = parsePaste(paste, tee.holes.length)
    if (!r) {
      setPasteErr(C.pasteError)
      return
    }
    setPasteErr(null)
    setTee({ holes: tee.holes.map((h, i) => ({ ...h, par: r.par[i]!, strokeIndex: r.si[i]!, yards: r.yards ? (r.yards[i] ?? null) : h.yards })) })
    setPaste('')
  }
  function removeTee() {
    if (d.tees.length <= 1) return
    const tees = d.tees.filter((_, i) => i !== teeIdx)
    setD({ ...d, tees })
    setTeeIdx(0)
  }
  function addTee() {
    setD({ ...d, tees: [...d.tees, blankTee(`Tee ${d.tees.length + 1}`)] })
    setTeeIdx(d.tees.length)
  }

  const par = tee.holes.reduce((s, h) => s + h.par, 0)
  const parKnown = untypedHoles(tee).length === 0

  return (
    <div className="stack">
      {notes.length > 0 && (
        <div className="card">
          <strong>{C.issues}</strong>
          <ul className="small">
            {notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="grid2">
        <Field label={C.courseName}>
          <input className="input" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
        </Field>
        <Field label={C.location}>
          <input className="input" value={d.location ?? ''} onChange={(e) => setD({ ...d, location: e.target.value || null })} />
        </Field>
      </div>

      <div className="row row--between">
        <div className="grow">
          <Segmented value={String(teeIdx)} options={d.tees.map((x, i) => ({ value: String(i), label: x.name || `Tee ${i + 1}` }))} onChange={(v) => setTeeIdx(Number(v))} label={t.common.whichTee} />
        </div>
        <button className="btn btn--ghost btn--sm" type="button" onClick={addTee}>
          + {C.addTee}
        </button>
      </div>

      <div className="grid2">
        <Field label={C.teeName}>
          <input className="input input--sm" value={tee.name} onChange={(e) => setTee({ name: e.target.value })} />
        </Field>
        <Field label={C.color}>
          <input className="input input--sm" value={tee.color ?? ''} onChange={(e) => setTee({ color: e.target.value || null })} />
        </Field>
        <Field label={C.rating}>
          <OptionalNumberField inputClassName="input--sm" decimals={1} value={tee.rating} onChange={(v) => setTee({ rating: v })} />
        </Field>
        <Field label={C.slope}>
          <OptionalNumberField inputClassName="input--sm" value={tee.slope} onChange={(v) => setTee({ slope: v })} />
        </Field>
      </div>

      <details className={styles.paste}>
        <summary>{C.paste}</summary>
        <p className="help">{C.pasteHint}</p>
        <textarea className="textarea" value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={'4 4 3 5 4 4 3 4 5 4 3 4 5 4 4 3 4 5\n7 11 17 3 1 13 15 9 5 8 18 2 12 4 10 16 6 14'} />
        {pasteErr && <p className="error">{pasteErr}</p>}
        <button className="btn btn--secondary btn--sm" type="button" onClick={applyPaste}>
          {C.pasteApply}
        </button>
      </details>

      <div className={styles.gridWrap}>
        <table className={`table ${styles.holes}`}>
          <thead>
            <tr>
              <th>{C.hole}</th>
              <th>{C.par}</th>
              <th>
                <SiAbbr />
              </th>
              <th>{C.yards}</th>
            </tr>
          </thead>
          <tbody>
            {tee.holes.map((h, i) => (
              <tr key={h.number}>
                <td className="num">{h.number}</td>
                <td>
                  <OptionalNumberField inputClassName="input--sm" label={C.parOf(h.number)} min={3} max={6} value={h.par === NOT_TYPED ? null : h.par} onChange={(v) => setHole(i, { par: v ?? NOT_TYPED })} />
                </td>
                <td>
                  <OptionalNumberField inputClassName="input--sm" label={C.siOf(h.number)} min={1} max={18} value={h.strokeIndex === NOT_TYPED ? null : h.strokeIndex} onChange={(v) => setHole(i, { strokeIndex: v ?? NOT_TYPED })} />
                </td>
                <td>
                  <OptionalNumberField inputClassName="input--sm" label={C.yardsOf(h.number)} value={h.yards} onChange={(v) => setHole(i, { yards: v })} />
                </td>
              </tr>
            ))}
            <tr>
              <td>
                <strong>{C.parTotal}</strong>
              </td>
              <td className="num">
                {/* The total of a card still being typed would be a number nobody gave. */}
                <strong>{parKnown ? par : ''}</strong>
              </td>
              <td colSpan={2} />
            </tr>
          </tbody>
        </table>
      </div>

      {issues.length > 0 && (
        <ul className="error small">
          {issues.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
      )}

      <div className="row">
        {d.tees.length > 1 && (
          <button className="btn btn--ghost btn--sm coral" type="button" onClick={removeTee}>
            {C.deleteTee}
          </button>
        )}
        <button className="btn btn--secondary" type="button" onClick={onCancel}>
          {t.common.cancel}
        </button>
        <button className="btn btn--primary grow" type="button" disabled={busy || !d.name.trim() || issues.length > 0} onClick={() => onSave(d)}>
          {busy ? t.common.saving : t.common.save}
        </button>
      </div>
    </div>
  )
}
