/**
 * Comité › Jugadores: which profile a player is. The Comité proposes one
 * (search by name or handle); the person confirms it from their profile or
 * the face grid ("¿Eres tú?"). Proposing your own profile confirms at once.
 */
import { useEffect, useState } from 'react'
import { t } from '../../i18n/es-MX'
import { Avatar, Sheet, toast } from '../../components/ui'
import { handleOk, comiteLinkProfile, comiteUnlinkProfile, searchProfiles, type ProfileHit, type TournamentProfile } from '../../data/profiles'
import a from './Admin.module.css'

const P = t.admin.players

export function ProfileLink({ playerId, profile, onChanged }: { playerId: string; profile: TournamentProfile | undefined; onChanged: () => void }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<ProfileHit[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const needle = q.trim()
    if (!open || needle.replace(/^@/, '').length < 2) {
      setHits([])
      return
    }
    let live = true
    const timer = setTimeout(() => {
      searchProfiles(needle)
        .then((r) => live && setHits(r))
        .catch(() => live && setHits([]))
    }, 250)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [q, open])

  async function link(handle: string) {
    setBusy(true)
    try {
      const r = await comiteLinkProfile(playerId, handle)
      if (r.ok) {
        toast(r.status === 'confirmed' ? P.linkedSelf : P.proposed)
        setOpen(false)
        setQ('')
        onChanged()
      } else toast(r.reason === 'taken' ? P.profileTaken : r.reason === 'already_linked' ? P.profileElsewhere : P.noProfile)
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function unlink() {
    setBusy(true)
    try {
      await comiteUnlinkProfile(playerId)
      onChanged()
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const typed = q.trim().replace(/^@/, '').toLowerCase()
  return (
    <div className="stack">
      <span className="label">{P.profile}</span>
      {profile ? (
        <div className={a.chipRow}>
          <Avatar name={profile.displayName} url={profile.avatarUrl} size="sm" />
          <span className={a.rowText}>
            <span className={a.rowTitle}>@{profile.handle}</span>
            <span className={a.rowSub}>{profile.status === 'confirmed' ? P.profileConfirmed : P.profilePending}</span>
          </span>
          <button className="btn btn--ghost btn--sm" type="button" disabled={busy} onClick={() => void unlink()}>
            {P.unlinkProfile}
          </button>
        </div>
      ) : (
        <div className={a.chipRow}>
          <span className={a.help}>{P.profileHint}</span>
          <button className="btn btn--secondary btn--sm" type="button" onClick={() => setOpen(true)}>
            {P.linkProfile}
          </button>
        </div>
      )}

      <Sheet open={open} onClose={() => setOpen(false)} title={P.linkProfile}>
        <div className="stack">
          <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={P.searchProfiles} aria-label={P.searchProfiles} autoFocus autoCapitalize="none" autoCorrect="off" />
          <div className={a.rows}>
            {hits.map((h) => (
              <button key={h.handle} type="button" className={a.rowBtn} disabled={busy} onClick={() => void link(h.handle)}>
                <Avatar name={h.displayName} url={h.avatarUrl} size="sm" />
                <span className={a.rowText}>
                  <span className={a.rowTitle}>{h.displayName}</span>
                  <span className={a.rowSub}>@{h.handle}</span>
                </span>
              </button>
            ))}
          </div>
          {handleOk(typed) && !hits.some((h) => h.handle === typed) && (
            <button className="btn btn--secondary" type="button" disabled={busy} onClick={() => void link(typed)}>
              {P.withHandle(typed)}
            </button>
          )}
        </div>
      </Sheet>
    </div>
  )
}
