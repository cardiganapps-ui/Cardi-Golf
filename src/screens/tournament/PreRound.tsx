/**
 * En vivo before anyone has played a hole (STRAT-10). The board was a table
 * of zeros for the weeks the PINs are out and all of Calcutta night: the
 * moment the group is most excited. Above the board, while no hole is saved
 * and a day is still to play: that day, its date and course, how long to go,
 * this phone's player's group (its tee time, starting hole and who is in it),
 * his tee and handicap for the day with its «¿Cómo se calculó?», and what he
 * still owes the bank when the tournament moves money. Every line only when
 * the tournament has it (no groups yet, no tees, no money): any tournament,
 * any number of days. A link to watch sees the day and the countdown only.
 */
import { memo, useEffect, useId, useState } from 'react'
import { t } from '../../i18n/es-MX'
import { HowCalculated } from '../../components/HowCalculated'
import { useCurrency } from '../../components/currency'
import { useTournament } from '../../data/tournamentStore'
import { formatMoney } from '../../lib/money'
import { untilDay } from '../../lib/countdown'
import { useTournamentCtx } from './tournamentContext'
import { useShowMoney } from './tournamentView'
import { countdownText, preRoundInfo } from './preRoundInfo'
import styles from './PreRound.module.css'

const P = t.live.pre

/** A clock for the countdown: the minute, while the view is on screen. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])
  return now
}

/** Memoized with no props: it reads the boards itself, and En vivo mounts it only while no hole is saved. */
export const PreRound = memo(function PreRound() {
  const data = useTournament((s) => s.data)
  const { me, spectator } = useTournamentCtx()
  const showMoney = useShowMoney()
  const cur = useCurrency()
  const now = useNow()
  const titleId = useId()
  if (!data) return null
  const info = preRoundInfo(data, spectator ? null : me.playerId, showMoney)
  if (!info) return null
  const tz = data.settings.timezone
  const countdown = info.at ? countdownText(untilDay(info.at.date, info.at.time, tz, now)) : null
  const where = [info.date, info.course].filter(Boolean).join(', ')
  return (
    <section className={styles.pre} aria-labelledby={titleId}>
      <div className={styles.head}>
        <span className="label" id={titleId}>
          {P.title}: {P.day(info.day, info.days)}
        </span>
        {where && <span className={styles.where}>{where}</span>}
        {countdown && (
          <span className={styles.countdown} role="timer" aria-live="off">
            {countdown}
          </span>
        )}
      </div>
      <dl className={styles.lines}>
        {info.group && (
          <div className={styles.line}>
            <dt>{P.group}</dt>
            <dd>
              <span>{P.groupLine(info.group.number, info.group.teeTime, info.group.startHole)}</span>
              {info.group.with.length > 0 && <span className={styles.sub}>{P.groupWith(info.group.with)}</span>}
            </dd>
          </div>
        )}
        {info.noGroup && (
          <div className={styles.line}>
            <dt>{P.group}</dt>
            <dd className={styles.sub}>{P.noGroup}</dd>
          </div>
        )}
        {info.firstTee && (
          <div className={styles.line}>
            <dt>{P.firstTee}</dt>
            <dd>{info.firstTee}</dd>
          </div>
        )}
        {info.tee && (
          <div className={styles.line}>
            <dt>{P.tee}</dt>
            <dd>{info.tee}</dd>
          </div>
        )}
        {info.hcp && (
          <div className={styles.line}>
            <dt>{P.hcp}</dt>
            <dd className={styles.figureLine}>
              <span className={styles.figure}>{info.hcp.value}</span>
              <HowCalculated why={info.hcp.why} about={P.hcp} label={String(info.hcp.value)}>
                {t.money.howCalculated}
              </HowCalculated>
            </dd>
          </div>
        )}
        {info.owes && (
          <div className={styles.line}>
            <dt>{info.owes.total > 0 ? P.owes : P.money}</dt>
            <dd>{info.owes.total > 0 ? P.owesLine(formatMoney(info.owes.total, cur), info.owes.parts) : P.paid}</dd>
          </div>
        )}
      </dl>
    </section>
  )
})
