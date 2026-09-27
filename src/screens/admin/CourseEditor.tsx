import { useMemo, useState } from 'react'
import { t } from '../../i18n/es-MX'
import { Field } from '../../components/ui'
import type { CourseDraft, CourseDraftTee } from '../../data/api'
import styles from './CourseEditor.module.css'

const C = t.admin.courses

export function validateTee(tee: CourseDraftTee): string[] {
  const issues: string[] = []
  const n = tee.holes.length
  const sis = [...tee.holes.map((h) => h.strokeIndex)].sort((a, b) => a - b)
  if (sis.some((si, i) => si !== i + 1)) issues.push(C.siNotPermutation)
  const par = tee.holes.reduce((s, h) => s + h.par, 0)
  if (n === 18 && (par < 62 || par > 78)) issues.push(C.parSum(par))
  return issues
}

/** Parse pasted lines: pars, stroke indexes, optional yards. */
export function parsePaste(text: string, holes: number): { par: number[]; si: number[]; yards: number[] | null } | null {
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

export function CourseEditor({ draft, notes, busy, onSave, onCancel, addTee }: { draft: CourseDraft; notes: string[]; busy: boolean; onSave: (d: CourseDraft) => void; onCancel: () => void; addTee: () => void }) {
  const [d, setD] = useState<CourseDraft>(draft)
  const [teeIdx, setTeeIdx] = useState(0)
  const [paste, setPaste] = useState('')
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
  // Keep the outer draft in sync when a tee is added from the parent.
  if (draft.tees.length !== d.tees.length && draft.tees.length > d.tees.length) {
    setD({ ...d, tees: [...d.tees, ...draft.tees.slice(d.tees.length)] })
  }

  const par = tee.holes.reduce((s, h) => s + h.par, 0)

  return (
    <div className="stack">
      {notes.length > 0 && (
        <div className="card" style={{ padding: 12 }}>
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
        <div className="segmented grow" role="tablist">
          {d.tees.map((x, i) => (
            <button key={i} type="button" role="tab" aria-selected={i === teeIdx} onClick={() => setTeeIdx(i)}>
              {x.name || `Tee ${i + 1}`}
            </button>
          ))}
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
          <input className="input input--sm input--num" type="number" step="0.1" value={tee.rating ?? ''} onChange={(e) => setTee({ rating: e.target.value === '' ? null : Number(e.target.value) })} />
        </Field>
        <Field label={C.slope}>
          <input className="input input--sm input--num" type="number" value={tee.slope ?? ''} onChange={(e) => setTee({ slope: e.target.value === '' ? null : Number(e.target.value) })} />
        </Field>
      </div>

      <details>
        <summary className="teal" style={{ cursor: 'pointer', fontWeight: 700 }}>
          {C.paste}
        </summary>
        <p className="help">{C.pasteHint}</p>
        <textarea className="textarea" value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={'4 4 3 5 4 4 3 4 5 4 3 4 5 4 4 3 4 5\n7 11 17 3 1 13 15 9 5 8 18 2 12 4 10 16 6 14'} />
        {pasteErr && <p className="error">{pasteErr}</p>}
        <button className="btn btn--secondary btn--sm" type="button" onClick={applyPaste} style={{ marginTop: 6 }}>
          {C.pasteApply}
        </button>
      </details>

      <div className={styles.gridWrap}>
        <table className={`table ${styles.holes}`}>
          <thead>
            <tr>
              <th>{C.hole}</th>
              <th>{C.par}</th>
              <th>{C.si}</th>
              <th>{C.yards}</th>
            </tr>
          </thead>
          <tbody>
            {tee.holes.map((h, i) => (
              <tr key={h.number}>
                <td className="num">{h.number}</td>
                <td>
                  <input className="input input--sm input--num" type="number" min={3} max={6} value={h.par} onChange={(e) => setHole(i, { par: Number(e.target.value) || 4 })} />
                </td>
                <td>
                  <input className="input input--sm input--num" type="number" min={1} max={18} value={h.strokeIndex} onChange={(e) => setHole(i, { strokeIndex: Number(e.target.value) || 1 })} />
                </td>
                <td>
                  <input className="input input--sm input--num" type="number" value={h.yards ?? ''} onChange={(e) => setHole(i, { yards: e.target.value === '' ? null : Number(e.target.value) })} />
                </td>
              </tr>
            ))}
            <tr>
              <td>
                <strong>{C.parTotal}</strong>
              </td>
              <td className="num">
                <strong>{par}</strong>
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
            {t.common.delete} tee
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
