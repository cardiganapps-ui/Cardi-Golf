/**
 * Mi Polo: home for anyone with an account. Who you are (tap for your
 * profile), any "¿Eres tú?" the Comité left you, then your tournaments by
 * what needs you now: in play, coming up, played. The join code and the
 * organizer's way in stay at the bottom.
 */
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { t } from '../../i18n/es-MX'
import { Wordmark } from '../../components/Wordmark'
import { InstallGuide } from '../../components/InstallGuide'
import { Avatar, Spinner, toast } from '../../components/ui'
import { IconChevronRight, IconSettings } from '../../components/icons'
import { listMyTournaments, type MyTournament } from '../../data/api'
import { linkMyProfile, unlinkMyProfile, useMyProfile, type MyLink } from '../../data/profiles'
import { EventMark } from './ProfileScreen'
import styles from './Profile.module.css'

const M = t.mipolo

interface Row {
  key: string
  slug: string
  name: string
  logoUrl: string | null
  status: MyLink['tournamentStatus']
  /** What I am there: a player (and which), and/or the Comité. */
  player: string | null
  organizer: boolean
}

function rowsOf(links: MyLink[], organizing: MyTournament[]): Row[] {
  const byId = new Map<string, Row>()
  for (const l of links) {
    if (l.linkStatus !== 'confirmed') continue
    byId.set(l.tournamentId, { key: l.tournamentId, slug: l.slug, name: l.name, logoUrl: l.logoUrl, status: l.tournamentStatus, player: l.displayName, organizer: false })
  }
  for (const o of organizing) {
    const had = byId.get(o.id)
    if (had) had.organizer = true
    else byId.set(o.id, { key: o.id, slug: o.slug, name: o.name, logoUrl: o.logoUrl, status: o.status as Row['status'], player: null, organizer: true })
  }
  return [...byId.values()]
}

export function MiPolo() {
  const navigate = useNavigate()
  const { profile, links, loading, error, load } = useMyProfile()
  const [organizing, setOrganizing] = useState<MyTournament[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [code, setCode] = useState('')

  useEffect(() => {
    void load(true)
    listMyTournaments()
      .then(setOrganizing)
      .catch(() => setOrganizing([]))
  }, [load])
  // The shell's read-only load can land last with no profile yet: ask again, creating it.
  useEffect(() => {
    if (!profile && !loading && !error) void load(true)
  }, [profile, loading, error, load])

  const pending = links.filter((l) => l.linkStatus === 'pending')
  const rows = useMemo(() => rowsOf(links, organizing), [links, organizing])
  const live = rows.filter((r) => r.status === 'live' || r.status === 'auction')
  const upcoming = rows.filter((r) => r.status === 'setup')
  const past = rows.filter((r) => r.status === 'finished')

  async function answer(l: MyLink, yes: boolean) {
    setBusy(l.playerId)
    try {
      if (yes) {
        const r = await linkMyProfile(l.playerId)
        if (!r.ok) toast(r.reason === 'already_linked' ? t.account.already : t.account.linkTaken)
      } else await unlinkMyProfile(l.playerId)
      await load()
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  function onJoin(e: FormEvent) {
    e.preventDefault()
    const clean = code.trim().toUpperCase()
    if (clean.length === 6) navigate(`/t/${clean}`)
  }

  if (!profile) return loading || !error ? <Spinner /> : <p className="error">{error}</p>

  const section = (label: string, list: Row[]) =>
    list.length > 0 && (
      <section className={styles.section}>
        <span className="label">{label}</span>
        <div className={styles.rows}>
          {list.map((r) => (
            <Link key={r.key} to={`/t/${r.slug}`} className={styles.row}>
              <EventMark name={r.name} logoUrl={r.logoUrl} />
              <span className={styles.rowText}>
                <span className={styles.rowTitle}>{r.name}</span>
                <span className={styles.rowSub}>{[r.player, r.organizer ? M.organizer : null].filter(Boolean).join(', ')}</span>
              </span>
              <span className={styles.rowEnd}>
                <IconChevronRight size={20} />
              </span>
            </Link>
          ))}
        </div>
      </section>
    )

  return (
    <div className={styles.screen}>
      <div className={styles.topBar}>
        <Wordmark />
        <Link to="/perfil/editar" className={styles.iconBtn} aria-label={t.profile.edit}>
          <IconSettings />
        </Link>
      </div>

      <Link to={`/p/${profile.handle}`} className={`${styles.hero} ${styles.heroLink}`}>
        <Avatar name={profile.displayName} url={profile.avatarUrl} size="lg" />
        <span className={styles.heroText}>
          <span className={styles.name}>{M.hello(profile.displayName.split(/\s+/)[0] ?? profile.displayName)}</span>
          <span className={styles.handle}>@{profile.handle}</span>
        </span>
      </Link>

      {pending.length > 0 && (
        <section className={styles.section}>
          <span className="label">{M.pendingTitle}</span>
          <div className={styles.rows}>
            {pending.map((l) => (
              <div key={l.playerId} className={styles.ask}>
                <span>{M.pendingLine(l.displayName, l.name)}</span>
                <div className={styles.askActions}>
                  <button className="btn btn--primary btn--sm" type="button" disabled={busy === l.playerId} onClick={() => void answer(l, true)}>
                    {M.yes}
                  </button>
                  <button className="btn btn--ghost btn--sm" type="button" disabled={busy === l.playerId} onClick={() => void answer(l, false)}>
                    {M.no}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {section(M.live, live)}
      {section(M.upcoming, upcoming)}
      {section(M.past, past)}
      {rows.length === 0 && pending.length === 0 && <p className={styles.help}>{M.empty}</p>}

      <section className={styles.section}>
        <h2>{t.home.joinTitle}</h2>
        <p className={styles.help}>{t.home.joinHint}</p>
        <form className={styles.joinForm} onSubmit={onJoin}>
          <label className="sr-only" htmlFor="join-code">
            {t.home.joinPlaceholder}
          </label>
          <input
            id="join-code"
            className={`input ${styles.codeInput}`}
            placeholder={t.home.joinPlaceholder}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
            autoCapitalize="characters"
            autoComplete="off"
            maxLength={6}
          />
          <button className="btn btn--secondary" type="submit" disabled={code.trim().length !== 6}>
            {t.home.joinButton}
          </button>
        </form>
      </section>

      <section className={styles.section}>
        <div className={styles.quiet}>
          {organizing.length > 0 && (
            <Link className="btn btn--ghost btn--sm" to="/organizer">
              {M.organizerLink}
            </Link>
          )}
          <Link className="btn btn--ghost btn--sm" to="/organizer/new">
            {M.newTournament}
          </Link>
        </div>
      </section>

      <InstallGuide />
    </div>
  )
}
