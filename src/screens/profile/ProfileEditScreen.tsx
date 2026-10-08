/**
 * `/perfil/editar`: the photo, the name people know you by, your handle,
 * club, city and a line about you; how your index is set; whether strangers
 * can find you. Signing out lives here too.
 */
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { t } from '../../i18n/es-MX'
import { Avatar, Field, Segmented, Spinner, Toggle, toast } from '../../components/ui'
import { useAuth } from '../../data/auth'
import { safeNext, signOutSafely } from '../../data/account'
import { HandleTakenError, handleOk, parseIndex, updateMyProfile, uploadMyAvatar, useMyProfile, type MyProfile, type ProfilePatch } from '../../data/profiles'
import { PushToggle } from './PushToggle'
import styles from './Profile.module.css'
import { humanError } from '../../lib/humanError'

const P = t.profile

const showIndex = (v: number | null) => (v == null ? '' : v < 0 ? `+${Math.abs(v)}` : String(v))

interface Form {
  handle: string
  displayName: string
  fullName: string
  homeClub: string
  city: string
  bio: string
  indexSource: 'polo' | 'manual'
  manualIndex: string
  discoverable: boolean
}

const toForm = (p: MyProfile): Form => ({
  handle: p.handle,
  displayName: p.displayName,
  fullName: p.fullName ?? '',
  homeClub: p.homeClub ?? '',
  city: p.city ?? '',
  bio: p.bio ?? '',
  indexSource: p.indexSource,
  manualIndex: showIndex(p.manualIndex),
  discoverable: p.discoverable,
})

export function ProfileEditScreen() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const welcome = params.get('bienvenida') === '1'
  const { ready, user, isAnonymous } = useAuth()
  const { profile, loading, error, load, setProfile } = useMyProfile()
  const [form, setForm] = useState<Form | null>(null)
  const [busy, setBusy] = useState(false)
  const [handleError, setHandleError] = useState<string | null>(null)
  /** Waiting for the server to end the session: on lie-fi that takes until auth-js's own deadline. */
  const [signingOut, setSigningOut] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!ready) return
    if (!user || isAnonymous) {
      navigate(`/entrar?next=${encodeURIComponent('/perfil/editar')}`, { replace: true })
      return
    }
    if (!profile && !loading && !error) void load(true)
  }, [ready, user, isAnonymous, profile, loading, error, load, navigate])

  useEffect(() => {
    if (profile && !form) setForm(toForm(profile))
  }, [profile, form])

  if (error && !profile) return <p className="error">{error}</p>
  if (!profile || !form) return <Spinner />
  const f = form
  const set = (patch: Partial<Form>) => setForm({ ...f, ...patch })
  const manual = parseIndex(f.manualIndex)
  const handle = f.handle.trim().toLowerCase()
  const valid = handleOk(handle) && f.displayName.trim().length > 0 && (f.indexSource === 'polo' || manual != null)

  async function onPhoto(file: File) {
    setBusy(true)
    try {
      const url = await uploadMyAvatar(profile!.id, file)
      setProfile(await updateMyProfile(profile!.id, { avatar_url: url }))
    } catch (e) {
      toast(humanError(e))
    } finally {
      setBusy(false)
    }
  }

  async function save() {
    setBusy(true)
    setHandleError(null)
    const patch: ProfilePatch = {
      handle,
      display_name: f.displayName.trim(),
      full_name: f.fullName.trim() || null,
      home_club: f.homeClub.trim() || null,
      city: f.city.trim() || null,
      bio: f.bio.trim() || null,
      index_source: f.indexSource,
      manual_index: f.indexSource === 'manual' ? manual : profile!.manualIndex,
      discoverable: f.discoverable,
    }
    try {
      const saved = await updateMyProfile(profile!.id, patch)
      setProfile(saved)
      toast(P.saved)
      navigate(welcome ? safeNext(params.get('next')) : `/p/${saved.handle}`, { replace: welcome })
    } catch (e) {
      if (e instanceof HandleTakenError) setHandleError(P.handleTaken)
      else toast(humanError(e))
    } finally {
      setBusy(false)
    }
  }

  async function leave() {
    setSigningOut(true)
    try {
      const r = await signOutSafely()
      if (r.done) navigate('/', { replace: true })
      else toast(r.reason)
    } finally {
      setSigningOut(false)
    }
  }

  return (
    <div className={`${styles.screen} ${styles.narrow}`}>
      <header className={styles.head}>
        <h1>{P.editTitle}</h1>
        {welcome && (
          <p className={styles.notice} role="status">
            {P.welcome}
          </p>
        )}
      </header>

      <form
        className={styles.form}
        onSubmit={(e) => {
          e.preventDefault()
          if (valid && !busy) void save()
        }}
      >
        <div className={styles.photoRow}>
          <Avatar name={f.displayName || profile.displayName} url={profile.avatarUrl} size="lg" />
          <button className="btn btn--secondary btn--sm" type="button" disabled={busy} onClick={() => fileRef.current?.click()}>
            {P.photo}
          </button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && void onPhoto(e.target.files[0])} />
        </div>

        <Field label={P.displayName} hint={P.displayNameHint}>
          <input className="input" value={f.displayName} maxLength={40} autoComplete="nickname" onChange={(e) => set({ displayName: e.target.value })} required />
        </Field>
        <Field label={P.handle} hint={P.handleHint} error={handleError ?? (f.handle && !handleOk(handle) ? P.handleHint : null)}>
          <span className={styles.prefixed}>
            <span className={styles.prefix} aria-hidden="true">
              @
            </span>
            <input
              className="input"
              value={f.handle}
              maxLength={20}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              onChange={(e) => {
                setHandleError(null)
                set({ handle: e.target.value.toLowerCase().replace(/[^a-z0-9._]/g, '') })
              }}
              required
            />
          </span>
        </Field>
        <Field label={P.fullName}>
          <input className="input" value={f.fullName} maxLength={80} autoComplete="name" onChange={(e) => set({ fullName: e.target.value })} />
        </Field>
        <Field label={P.homeClub}>
          <input className="input" value={f.homeClub} maxLength={80} onChange={(e) => set({ homeClub: e.target.value })} />
        </Field>
        <Field label={P.city}>
          <input className="input" value={f.city} maxLength={80} autoComplete="address-level2" onChange={(e) => set({ city: e.target.value })} />
        </Field>
        <Field label={P.bio} hint={P.bioCount(f.bio.length)}>
          <textarea className="textarea" value={f.bio} maxLength={280} rows={3} onChange={(e) => set({ bio: e.target.value })} />
        </Field>

        <div className={styles.section}>
          <span className="label">{P.indexSource}</span>
          <Segmented
            value={f.indexSource}
            options={[
              { value: 'polo', label: P.indexPolo },
              { value: 'manual', label: P.indexManualOption },
            ]}
            onChange={(v) => set({ indexSource: v })}
          />
          {f.indexSource === 'polo' ? (
            <span className={styles.help}>{P.indexPoloHint}</span>
          ) : (
            <Field label={P.manualIndex} hint={P.manualIndexHint} error={f.manualIndex && manual == null ? P.manualIndexHint : null}>
              <input className="input" value={f.manualIndex} inputMode="decimal" onChange={(e) => set({ manualIndex: e.target.value })} />
            </Field>
          )}
        </div>

        <Toggle label={P.discoverable} hint={P.discoverableHint} checked={f.discoverable} onChange={(v) => set({ discoverable: v })} />

        <button className="btn btn--primary btn--block" type="submit" disabled={busy || !valid}>
          {busy ? t.common.saving : t.common.save}
        </button>
      </form>

      <PushToggle />
      <div className={styles.session}>
        <Link className="btn btn--ghost" to={`/p/${profile.handle}`}>
          {P.viewProfile}
        </Link>
        <button className="btn btn--ghost" type="button" disabled={signingOut} onClick={() => void leave()}>
          {signingOut ? t.account.signingOut : t.account.signOut}
        </button>
      </div>
    </div>
  )
}
