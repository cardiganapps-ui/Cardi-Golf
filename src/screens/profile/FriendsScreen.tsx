/**
 * `/amigos`: find people, answer requests, see your friends, and add the
 * people you already played with. A friend sees your whole profile and can
 * start a rivalry with you.
 */
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { t } from '../../i18n/es-MX'
import { Avatar, Spinner, toast } from '../../components/ui'
import { IconChevronLeft, IconChevronRight, IconSearch } from '../../components/icons'
import { formatIndex, searchProfiles, type ProfileHit } from '../../data/profiles'
import { friendRemove, friendRequest, friendRespond, myFriends, type FriendCard, type MyFriends } from '../../data/social'
import { useRequireAccount } from './useRequireAccount'
import styles from './Profile.module.css'

const S = t.social

function Person({ p, sub, children }: { p: Pick<FriendCard, 'handle' | 'displayName' | 'avatarUrl'>; sub?: string | null; children?: ReactNode }) {
  return (
    <div className={styles.row}>
      <Link to={`/p/${p.handle}`} className={styles.personLink}>
        <Avatar name={p.displayName} url={p.avatarUrl} />
        <span className={styles.rowText}>
          <span className={styles.rowTitle}>{p.displayName}</span>
          <span className={styles.rowSub}>{sub ?? `@${p.handle}`}</span>
        </span>
      </Link>
      {children && <span className={styles.rowEnd}>{children}</span>}
    </div>
  )
}

const subOf = (f: FriendCard) => [f.homeClub, f.index != null ? `${t.profile.indexManual} ${formatIndex(f.index)}` : null].filter(Boolean).join(', ') || `@${f.handle}`

export function FriendsScreen({ fixture }: { fixture?: MyFriends }) {
  const ok = useRequireAccount('/amigos', !!fixture)
  const [data, setData] = useState<MyFriends | null>(fixture ?? null)
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<ProfileHit[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (fixture) return
    try {
      setData(await myFriends())
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e))
    }
  }, [fixture])
  useEffect(() => {
    if (ok) void load()
  }, [ok, load])

  // Search as you type, after two characters.
  useEffect(() => {
    const clean = q.trim().replace(/^@/, '')
    if (fixture || clean.length < 2) {
      setHits(null)
      return
    }
    let live = true
    const timer = window.setTimeout(() => {
      searchProfiles(clean)
        .then((r) => live && setHits(r))
        .catch(() => live && setHits([]))
    }, 250)
    return () => {
      live = false
      window.clearTimeout(timer)
    }
  }, [q, fixture])

  async function act(handle: string, fn: () => Promise<unknown>, done?: string) {
    if (fixture) return
    setBusy(handle)
    try {
      await fn()
      if (done) toast(done)
      await load()
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  const add = (h: { handle: string; displayName: string }) =>
    act(h.handle, async () => {
      const r = await friendRequest(h.handle)
      toast(r === 'accepted' ? S.nowFriends(h.displayName) : r === 'not_found' ? S.notFound : S.sent)
    })

  if (!ok || !data) return <Spinner />
  const known = new Set([...data.friends, ...data.incoming, ...data.outgoing].map((f) => f.handle))

  return (
    <div className={styles.screen}>
      <div className={styles.topBar}>
        <Link to="/" className={styles.iconBtn} aria-label={t.common.back}>
          <IconChevronLeft />
        </Link>
        <h1 className={styles.title}>{S.friends}</h1>
        <span className={styles.iconSpacer} />
      </div>

      <label className={styles.search}>
        <IconSearch size={20} />
        <span className="sr-only">{S.searchLabel}</span>
        <input className="input" type="search" placeholder={S.searchPlaceholder} value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" autoCapitalize="none" />
      </label>
      {hits && (
        <section className={styles.section}>
          {hits.length === 0 ? (
            <p className={styles.help}>{S.searchNone}</p>
          ) : (
            <div className={styles.rows}>
              {hits.map((h) => (
                <Person key={h.handle} p={h} sub={[`@${h.handle}`, h.homeClub].filter(Boolean).join(', ')}>
                  {known.has(h.handle) ? (
                    <IconChevronRight size={20} />
                  ) : (
                    <button className="btn btn--secondary btn--sm" type="button" disabled={busy === h.handle} onClick={() => void add(h)}>
                      {S.add}
                    </button>
                  )}
                </Person>
              ))}
            </div>
          )}
        </section>
      )}

      {data.incoming.length > 0 && (
        <section className={styles.section}>
          <span className="label">{S.incoming}</span>
          <div className={styles.rows}>
            {data.incoming.map((f) => (
              <Person key={f.handle} p={f} sub={subOf(f)}>
                <button className="btn btn--primary btn--sm" type="button" disabled={busy === f.handle} onClick={() => void act(f.handle, () => friendRespond(f.handle, true), S.nowFriends(f.displayName))}>
                  {S.accept}
                </button>
                <button className="btn btn--ghost btn--sm" type="button" disabled={busy === f.handle} onClick={() => void act(f.handle, () => friendRespond(f.handle, false))}>
                  {S.decline}
                </button>
              </Person>
            ))}
          </div>
        </section>
      )}

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <span className="label">{S.friends}</span>
          {data.friends.length > 0 && <span className={styles.help}>{data.friends.length}</span>}
        </div>
        {data.friends.length === 0 ? (
          <p className={styles.help}>{S.noFriends}</p>
        ) : (
          <div className={styles.rows}>
            {data.friends.map((f) => (
              <Person key={f.handle} p={f} sub={subOf(f)}>
                <Link to={`/p/${f.handle}/vs`} className="btn btn--ghost btn--sm">
                  {S.versus}
                </Link>
              </Person>
            ))}
          </div>
        )}
      </section>

      {data.suggestions.length > 0 && (
        <section className={styles.section}>
          <span className="label">{S.suggestions}</span>
          <div className={styles.rows}>
            {data.suggestions.map((f) => (
              <Person key={f.handle} p={f} sub={f.shared ? S.sharedTournaments(f.shared) : subOf(f)}>
                <button className="btn btn--secondary btn--sm" type="button" disabled={busy === f.handle} onClick={() => void add(f)}>
                  {S.add}
                </button>
              </Person>
            ))}
          </div>
        </section>
      )}

      {data.outgoing.length > 0 && (
        <section className={styles.section}>
          <span className="label">{S.outgoing}</span>
          <div className={styles.rows}>
            {data.outgoing.map((f) => (
              <Person key={f.handle} p={f} sub={subOf(f)}>
                <button className="btn btn--ghost btn--sm" type="button" disabled={busy === f.handle} onClick={() => void act(f.handle, () => friendRemove(f.handle))}>
                  {S.cancel}
                </button>
              </Person>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
