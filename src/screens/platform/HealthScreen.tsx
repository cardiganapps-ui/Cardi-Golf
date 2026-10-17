/**
 * Salud: is Polo well? The nightly backup, push, the database, locked-out
 * people, and the switches for an emergency: pause new accounts, pause new
 * tournaments, a maintenance banner for everyone. Each switch asks why.
 */
import { useCallback, useEffect, useState } from 'react'
import { t } from '../../i18n/es-MX'
import { ErrorBox, Spinner, Toggle } from '../../components/ui'
import { toast } from '../../components/toast'
import { Button, Field, Input } from '../../components/primitives'
import { ReasonSheet } from '../../components/ReasonSheet'
import { useAppFlags, usePlatformApi, type Health, type Telemetry } from '../../data/platform'
import { PhonesSection, Status } from './PhonesSection'
import { relTime } from '../../lib/relTime'
import s from './Platform.module.css'
import { humanError } from '../../lib/humanError'

const H = t.platform.health
/** A backup older than this is a problem: the cron runs nightly. */
const STALE_MS = 36 * 3600_000

type Pending = {
  key: 'new_accounts_paused' | 'new_tournaments_paused' | 'maintenance_banner'
  value: boolean | string | null
  label: string
} | null

/** The nightly deletion (0069, TRUST-18): its last night, and what it took over the week, by kind. */
function RetentionCard({ r }: { r: NonNullable<Health['retention']> }) {
  const week = Object.entries(r.week).filter(([, n]) => n > 0)
  return (
    <div className={s.healthCard}>
      <Status ok={r.last ? r.last.ok : null}>{H.retention}</Status>
      {r.last ? (
        <span className={r.last.ok ? undefined : s.problem}>{H.retentionLast(relTime(r.last.at), r.last.ok)}</span>
      ) : (
        <span className={s.help}>{H.retentionNever}</span>
      )}
      {r.last?.error && <span className={s.problem}>{r.last.error}</span>}
      {week.length ? (
        <>
          <span className={s.help}>{H.retentionWeek}</span>
          {week.map(([k, n]) => (
            <span key={k} className={s.help}>
              {H.retentionCount(H.retentionKind[k] ?? k, n)}
            </span>
          ))}
        </>
      ) : (
        r.last && <span className={s.help}>{H.retentionNone}</span>
      )}
      <span className={s.help}>{H.retentionHint}</span>
    </div>
  )
}

export function HealthScreen() {
  const api = usePlatformApi()
  const [h, setH] = useState<Health | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [banner, setBanner] = useState('')
  const [pending, setPending] = useState<Pending>(null)
  const [tel, setTel] = useState<Telemetry | null | 'unavailable'>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const next = await api.health()
      setH(next)
      setBanner(next.flags.maintenanceBanner ?? '')
    } catch (e) {
      setError(humanError(e))
    }
    // Its own request: a database without 0037 still shows the rest of Salud.
    api.telemetry(24).then(setTel, () => setTel('unavailable'))
  }, [api])
  useEffect(() => {
    void load()
  }, [load])

  if (error) return <ErrorBox error={error} onRetry={() => void load()} />
  if (!h) return <Spinner rows={6} />

  const lastOkAt = h.backup.lastOk?.at ? new Date(h.backup.lastOk.at).getTime() : null
  const backupFresh = lastOkAt != null && Date.now() - lastOkAt < STALE_MS
  const lastFailed = h.backup.last && !h.backup.last.ok
  const pushFailed = !!h.push.recent && h.push.recent.failed > 0

  return (
    <div className={s.screen}>
      <div className={s.sectionHead}>
        <h2>{t.platform.sections.health}</h2>
        <Button variant="ghost" size="sm" onClick={() => void load()}>
          {H.refresh}
        </Button>
      </div>

      <div className={s.cards}>
        <div className={s.healthCard}>
          <Status ok={h.backup.lastOk ? backupFresh && !lastFailed : null}>{H.backup}</Status>
          {h.backup.lastOk ? (
            <>
              <span>{H.backupOk(relTime(h.backup.lastOk.at))}</span>
              <span className={s.help}>
                {H.backupSize(
                  Math.round((h.backup.lastOk.bytes ?? 0) / 1024),
                  h.backup.lastOk.tables ?? 0,
                  h.backup.lastOk.rows ?? 0,
                )}
              </span>
              {!backupFresh && <span className={s.problem}>{H.backupStale}</span>}
            </>
          ) : (
            <span className={s.help}>{H.backupNever}</span>
          )}
          {lastFailed && (
            <span className={s.problem}>{H.backupFailed(relTime(h.backup.last!.at), h.backup.last!.error ?? '')}</span>
          )}
          <span className={s.help}>{H.backupWeek(h.backup.week.ok, h.backup.week.failed)}</span>
        </div>

        {h.retention && <RetentionCard r={h.retention} />}

        <div className={s.healthCard}>
          <Status ok={h.push.configured == null ? null : h.push.configured && !pushFailed}>{H.push}</Status>
          <span className={h.push.configured === false ? s.problem : undefined}>
            {h.push.configured == null ? H.pushUnknown : h.push.configured ? H.pushConfigured : H.pushMissing}
          </span>
          <span className={s.help}>{H.pushSubs(h.push.subscriptions, h.push.profiles)}</span>
          {h.push.recent && (
            <span className={pushFailed ? s.problem : s.help}>
              {H.pushRecent(h.push.recent.total, h.push.recent.failed)}
            </span>
          )}
          <span className={s.help}>{H.pushRecentNote}</span>
        </div>

        <div className={s.healthCard}>
          <Status ok={h.database.lastMigration != null}>{H.database}</Status>
          {h.database.lastMigration && (
            <span>{H.migration(h.database.lastMigration.name, relTime(h.database.lastMigration.at))}</span>
          )}
          <span className={s.help}>{H.notices24h(h.database.notifications24h)}</span>
        </div>

        <div className={s.healthCard}>
          <Status ok={h.people.deviceLocks + h.people.playerLocks === 0}>{H.people}</Status>
          <span>{H.blocked(h.people.blocked)}</span>
          <span className={s.help}>{H.locks(h.people.deviceLocks, h.people.playerLocks)}</span>
        </div>
      </div>

      {tel === 'unavailable' ? (
        <p className={s.help}>{H.telemetryUnavailable}</p>
      ) : tel ? (
        <PhonesSection tel={tel} />
      ) : null}

      <section className={s.section}>
        <div className={s.sectionHead}>
          <strong>{H.switches}</strong>
        </div>
        <p className={s.help}>{H.switchesHint}</p>
        <Toggle
          label={H.pauseAccounts}
          hint={H.pauseAccountsHint}
          checked={h.flags.newAccountsPaused}
          onChange={(v) =>
            setPending({
              key: 'new_accounts_paused',
              value: v,
              label: (v ? H.switchOn : H.switchOff)(H.pauseAccounts.toLowerCase()),
            })
          }
        />
        <Toggle
          label={H.pauseTournaments}
          hint={H.pauseTournamentsHint}
          checked={h.flags.newTournamentsPaused}
          onChange={(v) =>
            setPending({
              key: 'new_tournaments_paused',
              value: v,
              label: (v ? H.switchOn : H.switchOff)(H.pauseTournaments.toLowerCase()),
            })
          }
        />
        <Field label={H.banner} hint={H.bannerHint}>
          <Input
            value={banner}
            maxLength={200}
            placeholder={H.bannerPlaceholder}
            onChange={(e) => setBanner(e.target.value)}
          />
        </Field>
        <div className={s.actions}>
          <Button
            size="sm"

            disabled={!banner.trim() || banner.trim() === (h.flags.maintenanceBanner ?? '')}
            onClick={() => setPending({ key: 'maintenance_banner', value: banner.trim(), label: H.bannerSet })}
          >
            {H.bannerSet}
          </Button>
          {h.flags.maintenanceBanner && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPending({ key: 'maintenance_banner', value: null, label: H.bannerClear })}
            >
              {H.bannerClear}
            </Button>
          )}
        </div>
      </section>

      <ReasonSheet
        open={!!pending}
        title={H.switchTitle}
        body={pending?.label}
        confirmLabel={pending?.label ?? ''}
        onClose={() => setPending(null)}
        onConfirm={async (reason) => {
          if (!pending) return
          const flags = await api.setFlag(pending.key, pending.value, reason)
          // The banner is everyone's, the admin's own screen included.
          useAppFlags.getState().set(flags)
          toast(t.platform.saved)
          await load()
        }}
      />
    </div>
  )
}
