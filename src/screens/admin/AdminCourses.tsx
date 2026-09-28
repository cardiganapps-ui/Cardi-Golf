/**
 * Courses (§13, §13b): search a provider, read a scorecard photo, or type it
 * by hand. Every path lands in the same review editor before saving.
 */
import { useRef, useState } from 'react'
import { useAuth } from '../../data/auth'
import { t } from '../../i18n/es-MX'
import { ErrorBox, Sheet, Spinner, toast } from '../../components/ui'
import { EmptyState } from '../../components/primitives'
import { ConfirmSheet } from '../../components/ConfirmSheet'
import { deleteCourse, loadCourseDraft, saveCourse, uploadAsset, type CourseDraft } from '../../data/api'
import { useTournament } from '../../data/tournamentStore'
import { blobToBase64, downscaleImage } from '../../lib/images'
import { extractScorecard, fetchProviderCourse, RouteError, searchCourses } from '../../lib/courseApi'
import { hitRef, type ProviderCourse, type ProviderSearchHit } from '../../lib/courseProviders/types'
import { useCourses } from './useCourses'
import { blankTee, CourseEditor } from './CourseEditor'
import a from './Admin.module.css'

const C = t.admin.courses

export function AdminCourses() {
  const { courses, loading, error, refresh } = useCourses()
  const reload = useTournament((s) => s.reload)
  const uid = useAuth((s) => s.user?.id ?? null)
  const [draft, setDraft] = useState<CourseDraft | null>(null)
  const [notes, setNotes] = useState<string[]>([])
  const [mode, setMode] = useState<'none' | 'search' | 'import'>('none')
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<ProviderSearchHit[] | null>(null)
  const [searchMsg, setSearchMsg] = useState<string | null>(null)
  const [provider, setProvider] = useState<ProviderCourse | null>(null)
  const [pick, setPick] = useState<Set<number>>(new Set())
  const [busy, setBusy] = useState(false)
  const [reading, setReading] = useState(false)
  const [askDelete, setAskDelete] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function doSearch() {
    setBusy(true)
    setSearchMsg(null)
    setHits(null)
    try {
      const r = await searchCourses(q.trim())
      setHits(r)
      if (!r.length) setSearchMsg(C.noResults)
    } catch (e) {
      setSearchMsg(e instanceof RouteError && e.code === 'no_key' ? C.searchUnavailable : e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function chooseHit(h: ProviderSearchHit) {
    setBusy(true)
    try {
      const c = await fetchProviderCourse(hitRef(h))
      if (c.tees.length === 0) {
        // Location only: create the course now and go straight to the photo (§13b-A).
        const id = await saveCourse(provenance(c, []))
        pendingCourseId.current = id
        refresh()
        await reload()
        setMode('none')
        toast(C.locationCreated)
        fileRef.current?.click()
        return
      }
      setProvider(c)
      setPick(new Set(c.tees.map((_, i) => i)))
      setMode('import')
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
  const pendingCourseId = useRef<string | null>(null)

  const provenance = (c: ProviderCourse, tees: CourseDraft['tees']): CourseDraft => ({
    name: c.name,
    location: c.location,
    source: c.provider,
    externalId: c.externalId,
    attribution: c.attribution,
    website: c.website,
    latitude: c.latitude,
    longitude: c.longitude,
    tees,
  })

  function importPicked() {
    if (!provider) return
    setDraft(
      provenance(
        provider,
        provider.tees.filter((_, i) => pick.has(i)).map((tee) => ({ name: tee.name, color: tee.color, rating: tee.rating, slope: tee.slope, holes: tee.holes })),
      ),
    )
    setNotes([])
    setMode('none')
    setProvider(null)
  }

  async function onPhoto(file: File) {
    setReading(true)
    try {
      const isPdf = file.type === 'application/pdf'
      const { blob, type } = isPdf ? { blob: file, type: 'application/pdf' } : await downscaleImage(file, 2000, 0.9)
      const b64 = await blobToBase64(blob)
      const r = await extractScorecard(b64, type)
      const issues: string[] = []
      const tees = r.tees.map((tee) => {
        issues.push(...tee.issues.map((i) => `${tee.name}: ${i}`), `${tee.name}: ${C.confidence[tee.confidence]}`)
        return { name: tee.name, color: tee.color, rating: tee.rating, slope: tee.slope, holes: tee.holes }
      })
      // A course created from a location-only hit keeps its name and provenance; the photo fills the tees.
      const base = pendingCourseId.current ? await loadCourseDraft(pendingCourseId.current) : null
      pendingCourseId.current = null
      const d: CourseDraft = base ? { ...base, tees, source: base.source === 'manual' ? 'scorecard_photo' : base.source } : { name: r.courseName, source: 'scorecard_photo', tees }
      setDraft(d)
      setNotes(issues)
      // Keep the photo for later re-checks (saved once the course exists).
      pendingPhoto.current = { blob, type }
    } catch (e) {
      toast(e instanceof RouteError && e.code === 'no_key' ? C.photoUnavailable : e instanceof Error ? e.message : String(e))
    } finally {
      setReading(false)
    }
  }
  const pendingPhoto = useRef<{ blob: Blob; type: string } | null>(null)

  async function save(d: CourseDraft) {
    setBusy(true)
    try {
      const id = await saveCourse(d)
      if (pendingPhoto.current) {
        try {
          const ext = pendingPhoto.current.type === 'application/pdf' ? 'pdf' : 'jpg'
          const url = await uploadAsset(`courses/${id}/scorecard-${Date.now()}.${ext}`, pendingPhoto.current.blob, pendingPhoto.current.type)
          const { supabase } = await import('../../lib/supabase')
          await supabase().from('course_documents').insert({ course_id: id, kind: 'scorecard', url })
        } catch {
          /* the course is saved; the photo is a nice-to-have */
        }
        pendingPhoto.current = null
      }
      setDraft(null)
      refresh()
      await reload()
      toast(t.common.saved)
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  /** Closing the draft forgets anything armed for it (P1 21): a photo or a location-only course never lands on the next one. */
  function closeDraft() {
    setDraft(null)
    setNotes([])
    pendingPhoto.current = null
    pendingCourseId.current = null
  }

  async function edit(id: string) {
    setBusy(true)
    try {
      pendingPhoto.current = null
      pendingCourseId.current = null
      setDraft(await loadCourseDraft(id))
      setNotes([])
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: string) {
    setBusy(true)
    try {
      await deleteCourse(id)
      refresh()
      await reload()
      setAskDelete(null)
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={a.screen}>
      <div className={a.head}>
        <h2>{C.title}</h2>
      </div>
      <div className={a.chipRow}>
        <button className="btn btn--primary btn--sm" type="button" onClick={() => setMode('search')}>
          {C.search}
        </button>
        <button className="btn btn--secondary btn--sm" type="button" onClick={() => fileRef.current?.click()} disabled={reading}>
          {C.photo}
        </button>
        <input ref={fileRef} type="file" accept="image/*,application/pdf" hidden onChange={(e) => e.target.files?.[0] && void onPhoto(e.target.files[0])} />
        <button
          className="btn btn--secondary btn--sm"
          type="button"
          onClick={() => {
            pendingPhoto.current = null
            pendingCourseId.current = null
            setDraft({ name: '', tees: [blankTee()] })
            setNotes([])
          }}
        >
          {C.manual}
        </button>
      </div>
      {reading && <Spinner label={C.photoReading} />}
      <p className={a.help}>{C.photoHint}</p>
      {loading && <Spinner />}
      {error && <ErrorBox message={error} onRetry={refresh} />}
      {!loading && !error && courses.length === 0 && <EmptyState title={C.title} body={C.empty} />}
      {courses.length > 0 && (
        <div className={a.rows}>
          {courses.map((c) => (
            <div key={c.id} className={a.row}>
              <button type="button" className={a.rowBtn} onClick={() => void edit(c.id)} disabled={busy}>
                <span className={a.rowText}>
                  <span className={a.rowTitle}>{c.name}</span>
                  <span className={a.rowSub}>
                    {c.location ? `${c.location}, ` : ''}
                    {c.tees} {C.tees.toLowerCase()}, {C.source[c.source as keyof typeof C.source] ?? c.source}
                  </span>
                  {c.attribution && (
                    <span className={a.rowSub}>
                      {C.attribution}: {c.attribution}
                    </span>
                  )}
                </span>
              </button>
              {c.createdBy === uid ? (
                <button className="btn btn--ghost btn--sm" type="button" onClick={() => setAskDelete(c.id)}>
                  {t.common.delete}
                </button>
              ) : (
                <span className={a.rowSub}>{C.notMine}</span>
              )}
            </div>
          ))}
        </div>
      )}

      <ConfirmSheet open={!!askDelete} title={t.common.delete} body={t.common.confirmDelete} danger busy={busy} confirmLabel={t.common.delete} onConfirm={() => askDelete && void remove(askDelete)} onClose={() => setAskDelete(null)} />

      <Sheet open={mode === 'search'} onClose={() => setMode('none')} title={C.search}>
        <div className="stack">
          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault()
              void doSearch()
            }}
          >
            <input className="input grow" value={q} onChange={(e) => setQ(e.target.value)} placeholder={C.searchPlaceholder} autoFocus />
            <button className="btn btn--primary" type="submit" disabled={busy || q.trim().length < 2}>
              {t.common.search}
            </button>
          </form>
          {busy && <Spinner />}
          {searchMsg && <p className={a.help}>{searchMsg}</p>}
          {hits && hits.length > 0 && (
            <div className={a.rows}>
              {hits.map((h) => (
                <button key={hitRef(h)} type="button" className={`${a.row} ${a.rowBtn}`} onClick={() => void chooseHit(h)} disabled={busy}>
                  <span className={a.rowText}>
                    <span className={a.rowTitle}>{h.name}</span>
                    <span className={a.rowSub}>{[h.clubName, h.location].filter(Boolean).join(', ')}</span>
                    <span className={h.hasCard === false ? a.warn : a.rowSub}>{h.hasCard === true ? C.fullCard : h.hasCard === false ? C.locationOnly : C.cardUnknown}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </Sheet>

      <Sheet open={mode === 'import'} onClose={() => setMode('none')} title={C.importTees}>
        {provider && (
          <div className="stack">
            <strong>{provider.name}</strong>
            {provider.tees.map((tee, i) => (
              <label key={i} className="toggle">
                <span>
                  {tee.name}
                  {tee.gender === 'female' ? ` (${C.ladies})` : ''}
                  <span className="help">
                    Par {tee.holes.reduce((s, h) => s + h.par, 0)}
                    {tee.rating ? `, ${tee.rating} / ${tee.slope}` : ''}, {tee.holes.length} hoyos
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={pick.has(i)}
                  onChange={(e) => {
                    const n = new Set(pick)
                    if (e.target.checked) n.add(i)
                    else n.delete(i)
                    setPick(n)
                  }}
                />
              </label>
            ))}
            <button className="btn btn--primary" type="button" disabled={pick.size === 0} onClick={importPicked}>
              {C.import}
            </button>
          </div>
        )}
      </Sheet>

      <Sheet open={!!draft} onClose={closeDraft} title={draft?.id ? t.common.edit : C.review} wide>
        {draft && <CourseEditor draft={draft} notes={notes} busy={busy} onCancel={closeDraft} onSave={(d) => void save(d)} />}
      </Sheet>
    </div>
  )
}
