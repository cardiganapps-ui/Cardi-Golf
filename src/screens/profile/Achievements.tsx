/**
 * The profile's badges, records and the year in review (engine:
 * src/engine/profile/achievements.ts). Badges earned are inked with their
 * date; the rest wait outlined with what earns them. The recap is a share
 * image, never with money.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { t } from '../../i18n/es-MX'
import { Sheet } from '../../components/ui'
import { Wordmark } from '../../components/primitives'
import { IconChevronRight } from '../../components/icons'
import { badges, records, recapYears, yearRecap, type AchRound, type AchTournament, type Badge, type PersonalRecord } from '../../engine/profile/achievements'
import { shareCard } from '../../components/shareAction'
import styles from './Profile.module.css'

const A = t.achievements
const dayMonth = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const fmtDate = (d: string | null) => (d ? dayMonth.format(new Date(`${d.slice(0, 10)}T12:00:00Z`)) : null)
const tenths = (v: number) => (v < 0 ? `−${Math.abs(v).toFixed(1)}` : v.toFixed(1))

export function BadgesSection({ rounds, tournaments }: { rounds: AchRound[]; tournaments: AchTournament[] }) {
  const list = useMemo(() => badges(rounds, tournaments), [rounds, tournaments])
  const [open, setOpen] = useState<Badge | null>(null)
  const earned = list.filter((b) => b.earned)
  // Earned first (newest first), then the ones still to get in catalog order.
  const shown = [...earned.sort((a, b) => (b.unlockedAt ?? '').localeCompare(a.unlockedAt ?? '')), ...list.filter((b) => !b.earned)]
  return (
    <section className={styles.section}>
      <div className={styles.sectionHead}>
        <span className="label">{A.badges}</span>
        <span className={styles.help}>{A.badgesCount(earned.length, list.length)}</span>
      </div>
      <div className={styles.awards}>
        {shown.map((b) => (
          <button key={b.id} type="button" className={`${styles.award} ${b.earned ? styles.awardOn : ''}`} onClick={() => setOpen(b)}>
            {A.badge[b.id]!.name}
          </button>
        ))}
      </div>
      <Sheet open={!!open} onClose={() => setOpen(null)} title={open ? A.badge[open.id]!.name : undefined}>
        {open && (
          <div className="stack">
            <p>{A.badge[open.id]!.how}</p>
            <p className={styles.help}>{open.earned ? (open.unlockedAt ? A.earnedOn(fmtDate(open.unlockedAt)!) : A.earned) : A.locked}</p>
            {open.earned && open.slug && (
              <Link className="btn btn--secondary" to={`/t/${open.slug}`}>
                {t.profile.tournaments}
              </Link>
            )}
          </div>
        )}
      </Sheet>
    </section>
  )
}

function recordValue(r: PersonalRecord): string {
  switch (r.id) {
    case 'bestDifferential':
      return tenths(r.value)
    case 'longestParStreak':
      return A.holes(r.value)
    case 'bestFinish':
      return A.place(r.value, r.of)
    default:
      return String(r.value)
  }
}

export function RecordsSection({ rounds, tournaments, onRound }: { rounds: AchRound[]; tournaments: AchTournament[]; onRound: (roundId: string) => void }) {
  const list = useMemo(() => records(rounds, tournaments), [rounds, tournaments])
  return (
    <section className={styles.section}>
      <span className="label">{A.records}</span>
      {list.length === 0 ? (
        <p className={styles.help}>{A.noRecords}</p>
      ) : (
        <div className={styles.rows}>
          {list.map((r) => {
            const body = (
              <>
                <span className={styles.rowText}>
                  <span className={styles.rowTitle}>{A.record[r.id]}</span>
                  <span className={styles.rowSub}>{[r.where, fmtDate(r.date)].filter(Boolean).join(', ')}</span>
                </span>
                <span className={styles.rowFig}>{recordValue(r)}</span>
              </>
            )
            return r.roundId ? (
              <button key={r.id} type="button" className={styles.row} onClick={() => onRound(r.roundId!)}>
                {body}
              </button>
            ) : (
              <Link key={r.id} to={`/t/${r.slug}`} className={styles.row}>
                {body}
                <span className={styles.rowEnd}>
                  <IconChevronRight size={20} />
                </span>
              </Link>
            )
          })}
        </div>
      )}
    </section>
  )
}

/** "Compartir mi 2026": a share image of the year; offered to the owner. */
export function RecapButton({ name, handle, rounds, tournaments, now = new Date() }: { name: string; handle: string; rounds: AchRound[]; tournaments: AchTournament[]; now?: Date }) {
  const years = useMemo(() => recapYears(rounds, tournaments), [rounds, tournaments])
  const year = years.includes(now.getFullYear()) ? now.getFullYear() : years[0]
  const recap = useMemo(() => (year ? yearRecap(rounds, tournaments, year) : null), [rounds, tournaments, year])
  const ref = useRef<HTMLDivElement>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!busy || !ref.current || !year) return
    let cancelled = false
    const node = ref.current
    void (async () => {
      await new Promise((r) => setTimeout(r, 50))
      if (cancelled) return
      try {
        await shareCard(node, `polo-${handle}-${year}.png`, A.recap(year), A.recapShareText(year))
      } finally {
        if (!cancelled) setBusy(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [busy, handle, year])

  if (!recap || !year || recap.rounds + recap.tournaments === 0) return null
  return (
    <>
      <button className="btn btn--secondary" type="button" disabled={busy} onClick={() => setBusy(true)}>
        {busy ? t.share.generating : A.recapButton(year)}
      </button>
      {busy && (
        <div className={styles.offscreen} aria-hidden="true">
          <div ref={ref}>
            <RecapCard name={name} recap={recap} />
          </div>
        </div>
      )}
    </>
  )
}

export function RecapCard({ name, recap }: { name: string; recap: ReturnType<typeof yearRecap> }) {
  const figures: Array<[string, string]> = [
    [A.recapRounds, String(recap.rounds)],
    [A.recapTournaments, String(recap.tournaments)],
    [A.recapWins, String(recap.wins)],
    [A.recapPodiums, String(recap.podiums)],
    [A.recapBirdies, String(recap.birdies)],
    [A.recapEagles, String(recap.eagles)],
    [A.recapBest, recap.bestGross == null ? '—' : String(recap.bestGross)],
    [A.recapAvg, recap.avgGross == null ? '—' : recap.avgGross.toFixed(1)],
    [A.recapDiff, recap.bestDifferential == null ? '—' : tenths(recap.bestDifferential)],
  ]
  return (
    <div className={styles.recap}>
      <div className={styles.recapHead}>
        <span className={styles.recapYear}>{recap.year}</span>
        <span className={styles.recapName}>{name}</span>
      </div>
      <div className={styles.recapGrid}>
        {figures.map(([label, value]) => (
          <span key={label} className={styles.recapItem}>
            <span className={styles.recapFig}>{value}</span>
            <span className={styles.stripLabel}>{label}</span>
          </span>
        ))}
      </div>
      {(recap.favoriteCourse || recap.courses > 0) && (
        <p className={styles.help}>{[recap.courses > 0 ? `${A.recapCourses}: ${recap.courses}` : null, recap.favoriteCourse ? A.recapFavorite(recap.favoriteCourse) : null].filter(Boolean).join('. ')}</p>
      )}
      {recap.badges.length > 0 && (
        <div className="stack">
          <span className="label">{A.recapBadges}</span>
          <div className={styles.awards}>
            {recap.badges.map((id) => (
              <span key={id} className={`${styles.award} ${styles.awardOn}`}>
                {A.badge[id]!.name}
              </span>
            ))}
          </div>
        </div>
      )}
      <div className={styles.recapFoot}>
        <Wordmark size={14} />
      </div>
    </div>
  )
}
