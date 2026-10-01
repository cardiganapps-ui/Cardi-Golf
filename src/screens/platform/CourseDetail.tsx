/**
 * One course from the catalog: its tees and what is wrong with each card,
 * where it is played, and the courses that look like the same one. The
 * admin fixes a card with the same editor the Comité uses (and the finished
 * rounds played on it are recomputed), merges a duplicate into the good
 * one, or deletes one nobody plays.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useOutletContext, useParams } from 'react-router'
import { t } from '../../i18n/es-MX'
import { ErrorBox, Sheet, Spinner, toast } from '../../components/ui'
import { Field, Input } from '../../components/primitives'
import { ReasonSheet } from '../../components/ReasonSheet'
import { IconChevronLeft } from '../../components/icons'
import { loadCourseDraft, saveCourse, type CourseDraft } from '../../data/api'
import { sameCard, suggestTeeMap, usePlatformApi, type CourseTee, type PlatformCourse } from '../../data/platform'
import { relTime } from '../../lib/relTime'
import { CourseEditor } from '../admin/CourseEditor'
import type { TournamentsOutlet } from './TournamentsScreen'
import s from './Platform.module.css'
import { humanError } from '../../lib/humanError'

const C = t.platform.courses

export function CourseDetail() {
  const { id = '' } = useParams()
  const api = usePlatformApi()
  const navigate = useNavigate()
  const outlet = useOutletContext<TournamentsOutlet | undefined>()
  const [c, setC] = useState<PlatformCourse | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<CourseDraft | null>(null)
  const [busy, setBusy] = useState(false)
  const [mergeWith, setMergeWith] = useState<string | null>(null)
  const [asking, setAsking] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    try {
      setC(await api.course(id))
    } catch (e) {
      setError(humanError(e))
    }
  }, [api, id])
  useEffect(() => {
    setC(undefined)
    setDraft(null)
    void load()
  }, [load])

  const back = (
    <Link className={`btn btn--ghost btn--sm ${s.backLink}`} to=".." relative="path">
      <IconChevronLeft size={18} />
      {C.back}
    </Link>
  )
  if (error) return <>{back}<ErrorBox error={error} onRetry={() => void load()} /></>
  if (c === undefined) return <Spinner rows={6} />
  if (c === null) return <>{back}<p className={s.help}>{t.platform.notFound}</p></>
  const course = c
  const rounds = course.usedBy.reduce((n, u) => n + u.rounds, 0)

  async function edit() {
    setBusy(true)
    try {
      setDraft(await loadCourseDraft(course.id))
    } catch (e) {
      toast(humanError(e))
    } finally {
      setBusy(false)
    }
  }
  async function save(d: CourseDraft) {
    setBusy(true)
    try {
      await saveCourse(d)
      const n = rounds ? await api.refreshCourse(course.id) : 0
      toast(C.saved(n))
      setDraft(null)
      await load()
      outlet?.onChanged()
    } catch (e) {
      toast(humanError(e))
    } finally {
      setBusy(false)
    }
  }
  async function refresh() {
    setBusy(true)
    try {
      toast(C.refreshed(await api.refreshCourse(course.id)))
    } catch (e) {
      toast(humanError(e))
    } finally {
      setBusy(false)
    }
  }

  if (draft) {
    return (
      <div className={s.screen}>
        <h2>{course.name}</h2>
        {rounds > 0 && <p className={s.help}>{C.editHint}</p>}
        <CourseEditor draft={draft} notes={[]} busy={busy} onCancel={() => setDraft(null)} onSave={(d) => void save(d)} />
      </div>
    )
  }

  return (
    <div className={s.screen}>
      {back}
      <div className={s.detailHead}>
        <h2>{course.name}</h2>
        <span className={s.chips}>
          {course.dupes.length > 0 && <span className="chip chip--sun">{C.chips.dupe}</span>}
          {(course.tees.length === 0 || course.tees.some((x) => x.problems.length > 0)) && <span className="chip chip--coral">{C.chips.broken}</span>}
        </span>
        <span className={s.help}>
          {[course.location, C.source[course.source] ?? course.source, C.created(course.creatorEmail, relTime(course.createdAt))].filter(Boolean).join(', ')}
        </span>
        {course.attribution && <span className={s.help}>{course.attribution}</span>}
        <div className={s.actions}>
          <button className="btn btn--primary btn--sm" type="button" disabled={busy} onClick={() => void edit()}>
            {C.edit}
          </button>
          {rounds > 0 && (
            <button className="btn btn--secondary btn--sm" type="button" disabled={busy} onClick={() => void refresh()}>
              {C.refresh}
            </button>
          )}
          {rounds === 0 && (
            <button className="btn btn--ghost btn--sm" type="button" onClick={() => setAsking(true)}>
              {C.delete}
            </button>
          )}
        </div>
      </div>

      <section className={s.section}>
        <div className={s.sectionHead}>
          <strong>{C.tees}</strong>
        </div>
        {course.tees.length === 0 ? (
          <p className={s.help}>{C.noTees}</p>
        ) : (
          course.tees.map((tee) => <TeeCard key={tee.id} tee={tee} />)
        )}
      </section>

      <section className={s.section}>
        <div className={s.sectionHead}>
          <strong>{C.usedBy}</strong>
        </div>
        {course.usedBy.length === 0 ? (
          <p className={s.help}>{C.notUsed}</p>
        ) : (
          <div className={s.rows}>
            {course.usedBy.map((u) => (
              <Link key={u.tournamentId} className={s.row} to={`../../torneos/${u.tournamentId}`} relative="path">
                <span className={s.rowText}>
                  <span className={s.rowTitle}>{u.name}</span>
                  <span className={s.rowSub}>{C.usedLine(u.rounds)}</span>
                </span>
                <span className={s.rowEnd}>{u.protected && <span className="chip chip--coral">{t.platform.chips.protected}</span>}</span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {course.dupes.length > 0 && (
        <section className={s.section}>
          <div className={s.sectionHead}>
            <strong>{C.dupes}</strong>
          </div>
          <div className={s.rows}>
            {course.dupes.map((d) => (
              <div key={d.id} className={s.row}>
                <Link className={s.rowLink} to={`../${d.id}`} relative="path">
                  <span className={s.rowText}>
                    <span className={s.rowTitle}>{d.name}</span>
                    <span className={s.rowSub}>{[d.location, C.usedLine(d.rounds)].filter(Boolean).join(', ')}</span>
                  </span>
                </Link>
                <button className="btn btn--secondary btn--sm" type="button" onClick={() => setMergeWith(d.id)}>
                  {C.merge}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <ReasonSheet
        open={asking}
        title={C.deleteTitle}
        body={C.deleteBody}
        confirmLabel={C.delete}
        danger
        onClose={() => setAsking(false)}
        onConfirm={async (reason) => {
          await api.deleteCourse(course.id, reason)
          toast(C.deleted)
          outlet?.onChanged()
          navigate('..', { relative: 'path', replace: true })
        }}
      />
      {mergeWith && (
        <MergeSheet
          a={course.id}
          b={mergeWith}
          onClose={() => setMergeWith(null)}
          onMerged={(keepId) => {
            setMergeWith(null)
            outlet?.onChanged()
            if (keepId === course.id) void load()
            else navigate(`../${keepId}`, { relative: 'path', replace: true })
          }}
        />
      )}
    </div>
  )
}

/** A tee's card at a glance: par and stroke index per hole, and what is wrong with it. */
function TeeCard({ tee }: { tee: CourseTee }) {
  return (
    <div className={s.tee}>
      <div className={s.teeHead}>
        <strong>{tee.name}</strong>
        <span className={s.help}>{C.teeLine(tee.parTotal, tee.rating, tee.slope, tee.inUse)}</span>
      </div>
      {tee.problems.length > 0 && <span className={s.problem}>{t.common.andList(tee.problems.map((p) => C.problems[p] ?? p))}</span>}
      <div className={s.card} role="table" aria-label={tee.name}>
        {tee.holes.map((h) => (
          <span key={h.n} className={s.cardCell} role="cell">
            <span className={s.cardNo}>{h.n}</span>
            <span className={s.cardPar}>{h.par}</span>
            <span className={s.cardSi}>{h.si}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

/**
 * Which of two duplicates should stay: the one more rounds are played on;
 * on a tie, the one from a database or a scorecard photo over one typed by
 * hand; then the older one.
 */
function keepsFirst(x: PlatformCourse, y: PlatformCourse): boolean {
  const rounds = (c: PlatformCourse) => c.usedBy.reduce((n, u) => n + u.rounds, 0)
  if (rounds(x) !== rounds(y)) return rounds(x) > rounds(y)
  const typed = (c: PlatformCourse) => (c.source === 'manual' ? 1 : 0)
  if (typed(x) !== typed(y)) return typed(x) < typed(y)
  return x.createdAt <= y.createdAt
}

/**
 * Merge two courses. The better-established one stays by default (keepsFirst);
 * each tee of the one that goes is mapped to a kept tee with the same card
 * (pre-filled when there is one). The server checks it all again.
 */
function MergeSheet({ a, b, onClose, onMerged }: { a: string; b: string; onClose: () => void; onMerged: (keepId: string) => void }) {
  const api = usePlatformApi()
  const [pair, setPair] = useState<[PlatformCourse, PlatformCourse] | null>(null)
  const [keepFirst, setKeepFirst] = useState(true)
  const [map, setMap] = useState<Record<string, string>>({})
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([api.course(a), api.course(b)]).then(
      ([x, y]) => {
        if (!x || !y) return setError(t.platform.notFound)
        setPair([x, y])
        setKeepFirst(keepsFirst(x, y))
      },
      (e) => setError(humanError(e)),
    )
  }, [api, a, b])

  const keep = pair ? (keepFirst ? pair[0] : pair[1]) : null
  const drop = pair ? (keepFirst ? pair[1] : pair[0]) : null
  useEffect(() => {
    if (keep && drop) setMap(suggestTeeMap(drop.tees, keep.tees))
  }, [keep, drop])

  const rows = useMemo(
    () =>
      (drop?.tees ?? []).map((d) => {
        const target = keep?.tees.find((k) => k.id === map[d.id])
        const state = target ? (sameCard(d, target) ? 'ok' : 'mismatch') : d.inUse ? 'needed' : 'dropped'
        return { d, state }
      }),
    [drop, keep, map],
  )
  const ready = !!keep && !!drop && rows.every((r) => r.state === 'ok' || r.state === 'dropped') && reason.trim().length >= 3

  async function go() {
    if (!keep || !drop) return
    setBusy(true)
    setError(null)
    try {
      const res = await api.mergeCourses(keep.id, drop.id, map, reason.trim())
      toast(C.mergeDone(res.rounds))
      onMerged(keep.id)
    } catch (e) {
      setError(humanError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open onClose={onClose} title={C.mergeTitle}>
      <div className={s.section}>
        {!pair ? (
          error ? <p className={s.problem}>{error}</p> : <Spinner rows={4} />
        ) : (
          <>
            <div className={s.mergePair}>
              <span>
                <span className="label">{C.mergeKeep}</span>
                <strong>{keep!.name}</strong>
              </span>
              <button className="btn btn--ghost btn--sm" type="button" onClick={() => setKeepFirst(!keepFirst)}>
                {C.mergeSwap}
              </button>
              <span>
                <span className="label">{C.mergeDrop}</span>
                <strong>{drop!.name}</strong>
              </span>
            </div>
            <p className={s.help}>{C.mergeBody(drop!.name, keep!.name)}</p>
            <span className="label">{C.mergeMapTitle}</span>
            {rows.map(({ d, state }) => (
              <Field key={d.id} label={d.name} error={state === 'mismatch' ? C.mergeMismatch : state === 'needed' ? C.mergeNeedsMap : null}>
                <select className="input" value={map[d.id] ?? ''} onChange={(e) => setMap({ ...map, [d.id]: e.target.value })}>
                  <option value="">{d.inUse ? '—' : C.mergeUnmapped}</option>
                  {keep!.tees.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.name}
                    </option>
                  ))}
                </select>
              </Field>
            ))}
            <Field label={t.platform.reason} error={error}>
              <Input value={reason} maxLength={200} placeholder={t.platform.reasonPlaceholder} onChange={(e) => setReason(e.target.value)} />
            </Field>
            <button className="btn btn--primary btn--block" type="button" disabled={busy || !ready} onClick={() => void go()}>
              {busy ? t.common.saving : C.merge}
            </button>
          </>
        )}
      </div>
    </Sheet>
  )
}
