/**
 * Courses (§13, §13b): search a provider, read a scorecard photo, or type it
 * by hand. Every path lands in the same review editor before saving. A search
 * lists the catalog's own matches first («Ya en Polo»), so a course someone
 * already loaded is used instead of imported again, each with its «Tarjeta
 * verificada» badge (0075, STRAT-14); inside a Terminado tournament the Comité
 * may verify the cards its days played.
 */
import { useContext, useId, useMemo, useRef, useState } from 'react'
import { useAuth } from '../../data/auth'
import { t } from '../../i18n/es-MX'
import { ErrorBox, Sheet, Spinner } from '../../components/ui'
import { toast } from '../../components/toast'
import { Button, EmptyState } from '../../components/primitives'
import { ConfirmSheet } from '../../components/ConfirmSheet'
import { NoticeNote } from '../../components/LegalLinks'
import {
  deleteCourse,
  loadCourseDraft,
  saveCourse,
  uploadAsset,
  verifyCourse,
  type CatalogCourse,
  type CourseDraft,
} from '../../data/api'
import { ReasonSheet } from '../../components/ReasonSheet'
import { VerifiedBadge } from '../../components/VerifiedBadge'
import { TournamentContext } from '../tournament/tournamentContext'
import { useTournament } from '../../data/tournamentStore'
import { blobToBase64, extensionFor, prepareImage } from '../../lib/images'
import { extractScorecard, fetchProviderCourse, RouteError, searchCourses } from '../../lib/courseApi'
import { hitRef, type ProviderCourse, type ProviderSearchHit } from '../../lib/courseProviders/types'
import { useCourses } from './useCourses'
import { CourseEditor } from './CourseEditor'
import { blankTee } from './courseCells'
import a from './Admin.module.css'
import { humanError } from '../../lib/humanError'

const C = t.admin.courses

/** A name or place as a search reads it: lower case, no accents. */
const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

/** The catalog's courses a search names, by every word of it in the name or the place; at most five. */
function catalogMatches(courses: CatalogCourse[], q: string): CatalogCourse[] {
  const words = fold(q)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 2)
  if (!words.length) return []
  return courses
    .filter((c) => c.tees > 0 && words.every((w) => fold(`${c.name} ${c.location ?? ''}`).includes(w)))
    .slice(0, 5)
}

export function AdminCourses() {
  const { courses, loading, error, refresh } = useCourses()
  const reload = useTournament((s) => s.reload)
  // Inside a tournament (Comité › Campos), the courses its days play; /campos has no tournament.
  const ctx = useContext(TournamentContext)
  const data = useTournament((s) => s.data)
  const loadedId = useTournament((s) => s.tournamentId)
  const here = ctx && data && loadedId === ctx.tournamentId ? data.snapshot : null
  const mayVerify =
    !!here &&
    !!ctx?.me.isComite &&
    here.tournament.status === 'finished' &&
    !here.tournament.quick &&
    here.tournament.countsForStats
  const played = useMemo(() => new Set((here?.rounds ?? []).map((r) => r.courseId).filter(Boolean)), [here])
  const [verifying, setVerifying] = useState<CatalogCourse | null>(null)
  const uid = useAuth((s) => s.user?.id ?? null)
  const [draft, setDraft] = useState<CourseDraft | null>(null)
  /**
   * The draft as it opened, to tell typed work from a draft only looked at
   * (UX-15). An import or a photo read is work from the start: '' never matches.
   */
  const [draftFrom, setDraftFrom] = useState('')
  const openDraft = (d: CourseDraft, fresh: boolean) => {
    setDraft(d)
    setDraftFrom(fresh ? '' : JSON.stringify(d))
    setEdited(null)
    setPasting(false)
  }
  const [pasting, setPasting] = useState(false)
  /** The editor's draft as typed (it keeps its own copy): what tells the sheet there is work in it. */
  const [edited, setEdited] = useState<CourseDraft | null>(null)
  const [notes, setNotes] = useState<string[]>([])
  const [mode, setMode] = useState<'none' | 'search' | 'import'>('none')
  const [q, setQ] = useState('')
  /** What the last search asked: the catalog's matches follow it, not each letter typed. */
  const [asked, setAsked] = useState('')
  const [hits, setHits] = useState<ProviderSearchHit[] | null>(null)
  const [searchMsg, setSearchMsg] = useState<string | null>(null)
  const [provider, setProvider] = useState<ProviderCourse | null>(null)
  const [pick, setPick] = useState<Set<number>>(new Set())
  const [busy, setBusy] = useState(false)
  const [reading, setReading] = useState(false)
  const [askDelete, setAskDelete] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const photoNoteId = useId()
  const knownId = useId()

  const known = useMemo(() => catalogMatches(courses, asked), [courses, asked])

  async function doSearch() {
    setBusy(true)
    setSearchMsg(null)
    setHits(null)
    setAsked(q.trim())
    try {
      const r = await searchCourses(q.trim())
      setHits(r)
      if (!r.length && !catalogMatches(courses, q.trim()).length) setSearchMsg(C.noResults)
    } catch (e) {
      setSearchMsg(e instanceof RouteError && e.code === 'no_key' ? C.searchUnavailable : humanError(e))
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
      toast(humanError(e))
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
    openDraft(
      provenance(
        provider,
        provider.tees
          .filter((_, i) => pick.has(i))
          .map((tee) => ({ name: tee.name, color: tee.color, rating: tee.rating, slope: tee.slope, holes: tee.holes })),
      ),
      true,
    )
    setNotes([])
    setMode('none')
    setProvider(null)
  }

  async function onPhoto(file: File) {
    setReading(true)
    try {
      const isPdf = file.type === 'application/pdf'
      // Flattened on white: a transparent screenshot of a card would otherwise reach the reader on black. So it is a JPEG.
      const { blob, type } = isPdf
        ? { blob: file, type: 'application/pdf' }
        : await prepareImage(file, { maxWidth: 2000, maxHeight: 2000, quality: 0.9, background: 'white' })
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
      // The card came from the photo, whatever gave the course its name and place (the funnel counts how cards arrive, STRAT-14).
      const d: CourseDraft = base
        ? { ...base, tees, source: 'scorecard_photo' }
        : { name: r.courseName, source: 'scorecard_photo', tees }
      openDraft(d, true)
      setNotes(issues)
      // Keep the photo for later re-checks (saved once the course exists).
      pendingPhoto.current = { blob, type }
    } catch (e) {
      toast(e instanceof RouteError && e.code === 'no_key' ? C.photoUnavailable : humanError(e))
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
          const ext = extensionFor(pendingPhoto.current.type)
          const url = await uploadAsset(
            `courses/${id}/scorecard-${Date.now()}.${ext}`,
            pendingPhoto.current.blob,
            pendingPhoto.current.type,
          )
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
      toast(humanError(e))
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
      openDraft(await loadCourseDraft(id), false)
      setNotes([])
    } catch (e) {
      toast(humanError(e))
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
      toast(humanError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={a.screen}>
      <div className={a.head}>
        <h2>{C.title}</h2>
      </div>
      {/* Before the buttons: a photo goes to Anthropic to be read (TRUST-04, TRUST-05). */}
      <NoticeNote note={t.legal.scorecardNote} id={photoNoteId} />
      <div className={a.chipRow}>
        <Button variant="primary" size="sm" onClick={() => setMode('search')}>
          {C.search}
        </Button>
        <Button size="sm" onClick={() => fileRef.current?.click()} disabled={reading} aria-describedby={photoNoteId}>
          {C.photo}
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*,application/pdf"
          hidden
          onChange={(e) => e.target.files?.[0] && void onPhoto(e.target.files[0])}
        />
        <Button
          size="sm"

          onClick={() => {
            pendingPhoto.current = null
            pendingCourseId.current = null
            openDraft({ name: '', tees: [blankTee()] }, false)
            setNotes([])
          }}
        >
          {C.manual}
        </Button>
      </div>
      {reading && <Spinner label={C.photoReading} />}
      {loading && <Spinner />}
      {error && <ErrorBox error={error} onRetry={refresh} />}
      {!loading && !error && courses.length === 0 && <EmptyState title={C.title} body={C.empty} />}
      {courses.length > 0 && (
        <div className={a.rows}>
          {courses.map((c) => (
            <div key={c.id} className={a.row}>
              <button type="button" className={a.rowBtn} onClick={() => void edit(c.id)} disabled={busy}>
                <span className={a.rowText}>
                  <span className={a.rowTitle}>{c.name}</span>
                  {c.verifiedAt && <VerifiedBadge />}
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
              {mayVerify && played.has(c.id) && !c.verifiedAt && c.tees > 0 && (
                <Button size="sm" onClick={() => setVerifying(c)}>
                  {C.verify}
                </Button>
              )}
              {c.createdBy === uid ? (
                <Button variant="ghost" size="sm" onClick={() => setAskDelete(c.id)}>
                  {t.common.delete}
                </Button>
              ) : (
                <span className={a.rowSub}>{C.notMine}</span>
              )}
            </div>
          ))}
        </div>
      )}

      <ReasonSheet
        open={!!verifying}
        title={C.verifyTitle}
        body={verifying ? C.verifyBody(verifying.name) : undefined}
        confirmLabel={C.verify}
        onClose={() => setVerifying(null)}
        onConfirm={async (reason) => {
          if (!verifying || !ctx) return
          // The server holds the rule and says which part failed; the sheet shows it.
          await verifyCourse(verifying.id, ctx.tournamentId, reason)
          refresh()
          toast(C.verifyDone)
        }}
      />

      <ConfirmSheet
        open={!!askDelete}
        title={t.common.delete}
        body={t.common.confirmDelete}
        danger
        busy={busy}
        confirmLabel={t.common.delete}
        onConfirm={() => askDelete && void remove(askDelete)}
        onClose={() => setAskDelete(null)}
      />

      <Sheet open={mode === 'search'} onClose={() => setMode('none')} title={C.search}>
        <div className="stack">
          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault()
              void doSearch()
            }}
          >
            <input
              className="input grow"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={C.searchPlaceholder}
              autoFocus
            />
            <Button variant="primary" type="submit" disabled={busy || q.trim().length < 2}>
              {t.common.search}
            </Button>
          </form>
          {busy && <Spinner />}
          {searchMsg && <p className={a.help}>{searchMsg}</p>}
          {known.length > 0 && (
            <section className="stack" aria-labelledby={knownId}>
              <span className="label" id={knownId}>
                {C.inPolo}
              </span>
              <p className={a.help}>{C.inPoloHint}</p>
              <div className={a.rows}>
                {known.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={`${a.row} ${a.rowBtn}`}
                    disabled={busy}
                    onClick={() => {
                      setMode('none')
                      void edit(c.id)
                    }}
                  >
                    <span className={a.rowText}>
                      <span className={a.rowTitle}>{c.name}</span>
                      {c.verifiedAt && <VerifiedBadge />}
                      <span className={a.rowSub}>
                        {[c.location, `${c.tees} ${C.tees.toLowerCase()}`].filter(Boolean).join(', ')}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}
          {hits && hits.length > 0 && known.length > 0 && <span className="label">{C.providers}</span>}
          {hits && hits.length > 0 && (
            <div className={a.rows}>
              {hits.map((h) => (
                <button
                  key={hitRef(h)}
                  type="button"
                  className={`${a.row} ${a.rowBtn}`}
                  onClick={() => void chooseHit(h)}
                  disabled={busy}
                >
                  <span className={a.rowText}>
                    <span className={a.rowTitle}>{h.name}</span>
                    <span className={a.rowSub}>{[h.clubName, h.location].filter(Boolean).join(', ')}</span>
                    <span className={h.hasCard === false ? a.warn : a.rowSub}>
                      {h.hasCard === true ? C.fullCard : h.hasCard === false ? C.locationOnly : C.cardUnknown}
                    </span>
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
            <Button variant="primary" disabled={pick.size === 0} onClick={importPicked}>
              {C.import}
            </Button>
          </div>
        )}
      </Sheet>

      <Sheet
        open={!!draft}
        onClose={closeDraft}
        title={draft?.id ? t.common.edit : C.review}
        wide
        dirty={!!draft && (pasting || JSON.stringify(edited ?? draft) !== draftFrom)}
      >
        {draft && (
          <CourseEditor
            draft={draft}
            notes={notes}
            busy={busy}
            onCancel={closeDraft}
            onSave={(d) => void save(d)}
            onEdit={setEdited}
            onPasting={setPasting}
          />
        )}
      </Sheet>
    </div>
  )
}
