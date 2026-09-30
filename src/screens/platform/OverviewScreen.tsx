/**
 * Resumen: how Polo is doing, at a glance. Stat tiles for the counts, one
 * bar series for the last 30 days (pick which), and what happened last.
 */
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { t } from '../../i18n/es-MX'
import { ErrorBox, Spinner } from '../../components/ui'
import { Segmented } from '../../components/primitives'
import { IconFlag, IconPerson, IconShield } from '../../components/icons'
import { usePlatformApi, type PlatformDay, type PlatformEvent, type PlatformOverview } from '../../data/platform'
import { relTime } from '../../lib/relTime'
import s from './Platform.module.css'

const P = t.platform
const n = (v: number) => v.toLocaleString('es-MX')

type Series = 'scores' | 'accounts' | 'tournaments'

export function OverviewScreen() {
  const api = usePlatformApi()
  const [data, setData] = useState<{ overview: PlatformOverview; daily: PlatformDay[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [series, setSeries] = useState<Series>('scores')

  const load = useCallback(async () => {
    setError(null)
    try {
      const [overview, daily] = await Promise.all([api.overview(), api.daily(30)])
      setData({ overview, daily })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [api])
  useEffect(() => {
    void load()
  }, [load])

  if (error) return <ErrorBox message={error} onRetry={() => void load()} />
  if (!data) return <Spinner rows={6} />
  const o = data.overview

  return (
    <div className={s.screen}>
      <h2>{P.sections.overview}</h2>

      <div className={s.kpis}>
        <Kpi label={P.kpi.accounts} value={o.accounts} sub={P.kpi.accounts7d(o.accounts7d)} />
        <Kpi label={P.kpi.tournaments} value={o.tournaments} sub={P.kpi.live(o.live)} />
        <Kpi label={P.kpi.quickRounds} value={o.quickRounds} sub={P.kpi.devices(o.devices)} />
        <Kpi label={P.kpi.rounds} value={o.roundsFinished} sub={P.kpi.rounds30d(o.rounds30d)} />
        <Kpi label={P.kpi.scores} value={o.scores30d} sub={P.kpi.scoresHint} />
        <Kpi label={P.kpi.push} value={o.pushProfiles} sub={P.kpi.pushHint(o.profiles)} />
        <Kpi label={P.kpi.crews} value={o.crews} sub={P.kpi.courses(o.courses)} />
        <Kpi label={P.chips.protected} value={o.protected} sub={P.practiceCount(o.practice)} />
      </div>

      <section className={s.section}>
        <div className={s.sectionHead}>
          <strong>{P.activity}</strong>
        </div>
        <Segmented
          value={series}
          label={P.seriesLabel}
          options={(['scores', 'accounts', 'tournaments'] as const).map((v) => ({ value: v, label: P.series[v] }))}
          onChange={setSeries}
        />
        <Bars
          label={P.series[series]}
          days={data.daily.map((d) => ({ day: d.day, value: series === 'tournaments' ? d.tournaments + d.quickRounds : d[series] }))}
        />
      </section>

      <section className={s.section}>
        <div className={s.sectionHead}>
          <strong>{P.recent}</strong>
        </div>
        {o.recent.length === 0 ? (
          <p className={s.help}>{P.recentEmpty}</p>
        ) : (
          <div className={s.rows}>
            {o.recent.map((e) => (
              <RecentRow key={`${e.kind}-${e.id}`} e={e} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function Kpi({ label, value, sub }: { label: string; value: number; sub: string }) {
  return (
    <div className={s.kpi}>
      <span className={s.kpiLabel}>{label}</span>
      <span className={s.kpiValue}>{n(value)}</span>
      <span className={s.kpiSub}>{sub}</span>
    </div>
  )
}

const dayLabel = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })

/**
 * One series of daily bars. No axis scale to read: the readout above says
 * the exact figure for the bar under the pointer (or focus), and the total
 * when nothing is picked. The dashed line marks the busiest day.
 */
export function Bars({ label, days }: { label: string; days: Array<{ day: string; value: number }> }) {
  const [active, setActive] = useState<number | null>(null)
  const max = Math.max(1, ...days.map((d) => d.value))
  const total = days.reduce((sum, d) => sum + d.value, 0)
  const picked = active != null ? days[active] : null
  return (
    <figure className={s.chart}>
      <p className={s.readout} aria-live="polite">
        {picked ? P.dayTotal(label, picked.value, dayLabel(picked.day)) : `${label}: ${n(total)}`}
      </p>
      <div className={s.plot} onMouseLeave={() => setActive(null)}>
        <span className={s.maxLine} aria-hidden="true">
          <span className={s.maxLabel}>{n(max)}</span>
        </span>
        {days.map((d, i) => (
          <div
            key={d.day}
            className={`${s.col} ${active === i ? s.colActive : ''}`}
            tabIndex={0}
            role="img"
            aria-label={P.dayTotal(label, d.value, dayLabel(d.day))}
            onMouseEnter={() => setActive(i)}
            onFocus={() => setActive(i)}
            onBlur={() => setActive(null)}
            onClick={() => setActive(i)}
          >
            <span className={s.bar} style={{ height: `${(d.value / max) * 100}%` }} />
          </div>
        ))}
      </div>
      {days.length > 0 && (
        <div className={s.axis} aria-hidden="true">
          <span>{dayLabel(days[0]!.day)}</span>
          <span>{dayLabel(days[days.length - 1]!.day)}</span>
        </div>
      )}
    </figure>
  )
}

function RecentRow({ e }: { e: PlatformEvent }) {
  const when = relTime(e.at)
  if (e.kind === 'profile') {
    return (
      <Link className={s.row} to={e.handle ? `/p/${e.handle}` : '#'}>
        <span className={s.rowIcon}>
          <IconPerson size={20} />
        </span>
        <span className={s.rowText}>
          <span className={s.rowTitle}>{P.event.profile(e.label)}</span>
          <span className={s.rowSub}>{e.handle ? `@${e.handle}` : ''}</span>
        </span>
        <span className={s.rowEnd}>{when}</span>
      </Link>
    )
  }
  const tournamentId = e.kind === 'tournament' ? e.id : e.tournamentId
  const title = e.kind === 'tournament' ? (e.quick ? P.event.quick(e.label) : P.event.tournament(e.label)) : P.event.platform(P.actions[e.label] ?? e.label)
  const body = (
    <>
      <span className={s.rowIcon}>{e.kind === 'platform' ? <IconShield size={20} /> : <IconFlag size={20} />}</span>
      <span className={s.rowText}>
        <span className={s.rowTitle}>{title}</span>
        {e.reason && <span className={s.rowSub}>{e.reason}</span>}
      </span>
      <span className={s.rowEnd}>{when}</span>
    </>
  )
  return tournamentId ? (
    <Link className={s.row} to={`../torneos/${tournamentId}`} relative="path">
      {body}
    </Link>
  ) : (
    <div className={s.row}>{body}</div>
  )
}
