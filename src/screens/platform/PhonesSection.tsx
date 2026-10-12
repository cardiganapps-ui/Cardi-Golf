/**
 * Salud › «Teléfonos» (STRAT-02): what the phones reported (0037). Sync
 * times, phones and builds, speed, errors and use; never a name or an amount.
 */
import { t } from '../../i18n/es-MX'
import type { Telemetry } from '../../data/platform'
import { duration } from '../../lib/duration'
import { relTime } from '../../lib/relTime'
import s from './Platform.module.css'

const H = t.platform.health

export function Status({ ok, children }: { ok: boolean | null; children: React.ReactNode }) {
  return (
    <span className={s.healthHead}>
      <span className={ok == null ? s.dotUnknown : ok ? s.dotOk : s.dotBad} aria-hidden="true" />
      {children}
    </span>
  )
}

function vitalValue(name: string, v: number): string {
  return name === 'cls' ? v.toLocaleString('es-MX', { maximumFractionDigits: 2 }) : duration(v)
}

/** What the phones reported (0037): sync times, phones and builds, speed, errors, use. */
export function PhonesSection({ tel }: { tel: Telemetry }) {
  const lag = tel.sync.find((x) => x.name === 'apply_lag')
  const ack = tel.sync.find((x) => x.name === 'save_ack')
  const d = tel.devices
  return (
    <section className={s.section} aria-labelledby="health-phones">
      <div className={s.sectionHead}>
        <strong id="health-phones">{H.phones}</strong>
      </div>
      <p className={s.help}>{H.phonesHint}</p>
      <div className={s.cards}>
        <div className={s.healthCard}>
          <Status ok={lag ? lag.p95 <= 2000 : null}>{H.sync}</Status>
          {lag ? (
            <>
              <span>{H.syncLag(duration(lag.p50), duration(lag.p95))}</span>
              {lag.over2s > 0 && <span className={s.problem}>{H.syncSlow(lag.over2s, lag.count)}</span>}
            </>
          ) : (
            <span className={s.help}>{H.syncNone}</span>
          )}
          {ack && <span className={s.help}>{H.syncAck(duration(ack.p50), duration(ack.p95))}</span>}
        </div>
        <div className={s.healthCard}>
          <Status ok={d.seen ? d.pending === 0 && d.rejected === 0 : null}>{H.devices}</Status>
          <span>{H.devicesSeen(d.seen)}</span>
          <span className={d.pending ? s.problem : s.help}>{H.devicesPending(d.pending, d.withPending, d.oldestPendingAt ? relTime(d.oldestPendingAt) : null)}</span>
          {d.rejected > 0 && <span className={s.problem}>{H.devicesRejected(d.rejected)}</span>}
          {d.builds.map((b) => (
            <span key={`${b.build}`} className={s.help}>
              {H.build(b.buildSha, b.count)}
            </span>
          ))}
        </div>
        <div className={s.healthCard}>
          <Status ok={null}>{H.vitals}</Status>
          {tel.vitals.length ? (
            tel.vitals.map((v) => (
              <span key={v.name}>
                {(H.vital[v.name] ?? v.name)}: {vitalValue(v.name, v.p75)}
              </span>
            ))
          ) : (
            <span className={s.help}>{H.vitalsNone}</span>
          )}
        </div>
        <div className={s.healthCard}>
          <Status ok={tel.errors.length === 0}>{H.errors}</Status>
          {tel.errors.length ? (
            tel.errors.map((e) => (
              <span key={`${e.name}|${e.summary}|${e.build}`} className={s.errorLine}>
                <span className={s.problem}>{e.summary || e.name}</span>
                <span className={s.help}>
                  {H.errorWhere(e.route, H.errorLine(e.count, e.devices, relTime(e.last_at)), e.buildSha)}
                </span>
              </span>
            ))
          ) : (
            <span className={s.help}>{H.errorsNone}</span>
          )}
        </div>
        {tel.funnel.length > 0 && (
          <div className={s.healthCard}>
            <Status ok={null}>{H.usage}</Status>
            {tel.funnel.map((f) => (
              <span key={f.name}>
                {H.step[f.name] ?? f.name}: {H.usageLine(f.count, f.people)}
              </span>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

