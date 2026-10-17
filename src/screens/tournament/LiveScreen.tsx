/**
 * En vivo (§9.2): the flagship board. One status line, the honoree as one
 * row detail, the individual leaderboard (points, or gross to par on a
 * toggle), and the feed. Rows re-sort once, in 200 ms.
 */
import { motion } from 'motion/react'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router'
import { hcpFromTo, t, type RowSpeech } from '../../i18n/es-MX'
import { formatMoney } from '../../lib/money'
import { asksMySheet } from '../../lib/noticeText'
import { Avatar } from '../../components/ui'
import { Board, BoardHead, EmptyState, LeaderRow, Money, Segmented, type Tone } from '../../components/primitives'
import { toPar } from '../../components/notation'
import { IconAlert } from '../../components/icons'
import { useTournament } from '../../data/tournamentStore'
import { lastSeen, markSeen, type SeenBoard, type SeenRow } from '../../data/boardSeen'
import { currentHole, lastPlayedHole } from '../../lib/holes'
import type { TournamentState } from '../../engine/computeTournament'
import type { IndividualRow } from '../../engine/modules/individual'
import { ShareCardButton } from '../../components/ShareCard'
import { InstallCard } from '../../components/InstallGuide'
import { FeedTicker } from './FeedTicker'
import { PlayerSheet } from './PlayerSheet'
import { useTournamentCtx } from './tournamentContext'
import { tournamentBase, useShowMoney } from './tournamentView'
import { DemoIntro, SpectatorNote } from '../spectator/SpectatorNote'
import { useSavedWhen } from './boardsAge'
import { useBoardsMayBeOld } from './connection'
import { QuickFinish } from './QuickFinish'
import { PreRound } from './PreRound'
import { isPreRound } from './preRoundInfo'
import { SaveResults } from './SaveResults'
import { TournamentPushOffer } from './TournamentPush'
import { MyDataCard } from './MyDataCard'
import { useActiveRound } from './useMyGroup'
import { figureKind, holeStrokes, mainScoring } from '../../engine/formats'
import styles from './LiveScreen.module.css'
import { ease } from '../../design/motion'
import { useCurrency, useWords } from '../../components/currency'

/** Gross strokes to par over the holes actually played (pick-ups excluded). Display only. */
function grossToPar(state: TournamentState, playerId: string, roundId?: string): number | null {
  let d = 0
  let n = 0
  for (const rid of roundId ? [roundId] : state.core.roundIds) {
    for (const h of state.core.rounds[rid]?.[playerId]?.holes ?? []) {
      if (h.played && !h.pickedUp && h.gross != null) {
        d += h.gross - h.par
        n++
      }
    }
  }
  return n ? d : null
}

/** A row's day on the Puntos reading, as the row shows it and as it is said. */
function pointsDay(r: IndividualRow, roundIdx: number): { today: string | undefined; todayTone: Tone | undefined; todaySpoken: string | undefined } {
  const day = roundIdx >= 0 ? r.perRound[roundIdx] : undefined
  let today = day && !day.empty ? day.text : undefined
  let todayTone: Tone | undefined
  let todaySpoken: string | undefined
  // A match result reads the same for both sides: its colour and spoken form say who won it.
  if (day?.result) {
    // The side that lost a match that went the distance is «1 abajo», on screen as when spoken.
    if (day.result === 'lost') today = day.text.replace(/ arriba$/, ' abajo')
    todayTone = day.result === 'won' ? 'under' : day.result === 'lost' ? 'over' : 'even'
    todaySpoken = t.live.matchDay(day.result, day.text)
  }
  return { today, todayTone, todaySpoken }
}

/** The board as the Puntos reading shows it: each row with a result, its place and its figures. */
function boardNow(rows: readonly IndividualRow[], roundIdx: number, roundId: string | null): SeenBoard {
  const out: Record<string, SeenRow> = {}
  for (const r of rows) if (!r.figure.empty) out[r.playerId] = { place: r.position, figure: r.figure.text, today: pointsDay(r, roundIdx).today ?? '' }
  return { round: roundId, rows: out }
}

/**
 * MOT-06, MOT-18: the board as this phone showed it the last time it was on screen, kept for as long as it stays:
 * every row's movement and every changed figure count from it, the ones that arrive while it is on screen too.
 * Each board shown while the page is visible is the next look's; coming back from the background (the phone in a
 * pocket between shots) is a new look, from the board shown when it went. With no last look (the phone's first,
 * or nothing kept), it is the board this screen opened on.
 */
function useLastLook(tournamentId: string, now: SeenBoard | null, keep: boolean): SeenBoard | null {
  const [look, setLook] = useState(() => ({ tournamentId, board: lastSeen(tournamentId, keep) ?? now }))
  if (look.tournamentId !== tournamentId || (look.board === null && now !== null)) {
    setLook({ tournamentId, board: (look.tournamentId !== tournamentId ? lastSeen(tournamentId, keep) : null) ?? now })
  }
  const latest = useRef(now)
  useEffect(() => {
    latest.current = now
    if (now && document.visibilityState !== 'hidden') markSeen(tournamentId, now, keep)
  }, [tournamentId, now, keep])
  useEffect(() => {
    const onShow = () => {
      if (document.visibilityState !== 'visible') return
      setLook({ tournamentId, board: lastSeen(tournamentId, keep) ?? latest.current })
      if (latest.current) markSeen(tournamentId, latest.current, keep)
    }
    document.addEventListener('visibilitychange', onShow)
    return () => document.removeEventListener('visibilitychange', onShow)
  }, [tournamentId, keep])
  return look.tournamentId === tournamentId ? look.board : null
}

/**
 * The strip's second line: where the lead group is, and how fresh the boards are. Its own component: a
 * reload that brought nothing new, and the 30 s clock, render this line and not the board (PERF-09).
 */
const DetailLine = memo(function DetailLine({ lead }: { lead: string | null }) {
  const updatedWhen = useSavedWhen(useTournament((s) => s.updatedAt))
  // While the boards may be old (the phone's copy, no signal, a fetch that
  // failed), the header's second line says how old: once is enough.
  const ageInHeader = useBoardsMayBeOld()
  const line = [lead, updatedWhen == null || ageInHeader ? null : t.live.updated(updatedWhen)].filter(Boolean).join('. ')
  // It follows the status on the same line (VIS-20): «Día 2, en juego. Grupo puntero en el hoyo 12».
  return line ? <span>. {line}</span> : null
})

/** The share target, one object for every render: a new one each time would render the button again (PERF-09). */
const LEADERBOARD = { kind: 'leaderboard' } as const

/**
 * One row of the board, from plain values: a change elsewhere on the board, or a reload that brought
 * nothing new, renders only the rows whose values changed (PERF-09).
 */
const BoardRow = memo(function BoardRow(props: {
  playerId: string
  /** Its place on the board: a row that moves renders in the commit that moves it, so Motion slides it from where it was. */
  place: number
  animate: boolean
  pos: string
  name: string
  /** The team's players, under a team format; else the player's tier and «estimado». */
  teamNames: string | null
  tier: string | null
  estimated: boolean
  cash: number
  owners: string | undefined
  /** The owners by name, for a screen reader («dueños: Iván y Camilo»); the row shows their initials. */
  ownersSpoken: string | undefined
  honoree: boolean
  honoreeLabel: string
  unit: RowSpeech['unit']
  today: string | undefined
  todayTone: Tone | undefined
  todaySpoken: string | undefined
  thru: string | undefined
  figure: string
  tone: Tone
  mine: boolean
  /** Places moved since this phone last showed the board (MOT-06); 0 when it did not, or there is no last look. */
  movedBy: number
  /** Its figures as this phone last showed them (MOT-18), on the Puntos reading only. */
  seenToday: string | undefined
  seenFigure: string | undefined
  reading: 'points' | 'gross'
  dense: boolean
  onOpen: (playerId: string) => void
}) {
  const cur = useCurrency()
  const { playerId, place, animate, teamNames, tier, estimated, cash, ownersSpoken, honoreeLabel, unit, onOpen, ...row } = props
  // A11Y-11: what the row shows, said: the sub line's category and money and the owners' names.
  const speech: RowSpeech = {
    honoree: row.honoree ? honoreeLabel : null,
    tier: teamNames == null ? tier : null,
    estimated: teamNames == null && estimated,
    unit,
    money: cash > 0 ? formatMoney(cash, cur) : null,
    owners: ownersSpoken,
  }
  const sub = (
    <span className={styles.sub}>
      {teamNames != null ? (
        <span>{teamNames}</span>
      ) : (
        <>
          {tier && <span className="tierBadge">{tier}</span>}
          {estimated && <span>{t.admin.players.estimated}</span>}
        </>
      )}
      {cash > 0 && (
        <span className={styles.subMoney}>
          <Money amount={cash} />
        </span>
      )}
    </span>
  )
  return (
    <motion.div layout={animate} layoutDependency={place} transition={ease}>
      <LeaderRow {...row} sub={sub} speech={speech} onClick={() => onOpen(playerId)} />
    </motion.div>
  )
})

export function LiveScreen() {
  const data = useTournament((s) => s.data)
  const ctx = useTournamentCtx()
  const { me, spectator } = ctx
  const base = tournamentBase(ctx)
  // A link to watch «Sin dinero» (STRAT-05): no money chips, no owners, no «si terminara ahora».
  const showMoney = useShowMoney()
  const words = useWords()
  const round = useActiveRound()
  // A notice that the Comité corrected this phone's card (TRUST-14) opens its own player's sheet: on arrival, and on
  // a tap that lands while En vivo is already open (the router changes the address, PWA-12).
  const { search } = useLocation()
  const mine = !spectator && asksMySheet(search) ? me.playerId : null
  const [open, setOpen] = useState<string | null>(mine)
  const searchSeen = useRef(search)
  useEffect(() => {
    if (searchSeen.current === search) return
    searchSeen.current = search
    if (mine) setOpen(mine)
  }, [search]) // eslint-disable-line react-hooks/exhaustive-deps -- when the address changes, with whose phone this is then
  const closeSheet = useCallback(() => setOpen(null), [])
  const [view, setView] = useState<'points' | 'gross'>('points')

  const rows = useMemo(() => data?.state.modules.individual?.rows ?? [], [data])
  // The board as this phone shows it now, on the Puntos reading, and as it showed it last time (MOT-06, MOT-18).
  const roundId = round?.id ?? null
  const shownNow = useMemo(() => (data ? boardNow(rows, roundId ? data.state.core.roundIds.indexOf(roundId) : -1, roundId) : null), [data, rows, roundId])
  // A link to watch keeps nothing of the tournament on the phone (STRAT-05): its last look lasts the visit.
  const since = useLastLook(ctx.tournamentId, shownNow, !spectator)

  const owners = useMemo(() => {
    const m = new Map<string, { initials: string; spoken: string }>()
    if (!data?.state.modules.auction || !showMoney) return m
    for (const lot of data.state.modules.auction.lots) {
      if (lot.status !== 'sold') continue
      const names = lot.owners.map((o) => data.snapshot.players.find((p) => p.id === o.ownerId)?.displayName ?? '?')
      m.set(lot.playerId, { initials: names.map((n) => (n === '?' ? n : n.slice(0, 2).toUpperCase())).join(' '), spoken: t.live.ownersSpoken(names) })
    }
    return m
  }, [data, showMoney])

  if (!data) return null
  const { snapshot, state, settings } = data
  const byId = new Map(snapshot.players.map((p) => [p.id, p]))
  const board = state.modules.individual
  // A team format ranks teams, so a row covers more than one player.
  const byTeam = board?.byTeam ?? false
  const honoree = snapshot.players.find((p) => p.isHonoree)
  const honoreeRow = honoree ? rows.find((r) => r.entrant.playerIds.includes(honoree.id)) : null
  const roundState = round ? state.core.rounds[round.id] : undefined
  // «hoy» beside the board's total: his team's day in a team event (its total is the team's), else his own points.
  const honoreeToday = (() => {
    if (!honoree || !honoreeRow) return null
    if (!honoreeRow.entrant.isTeam) return roundState?.[honoree.id]?.points ?? null
    const day = round ? honoreeRow.perRound[state.core.roundIds.indexOf(round.id)] : undefined
    return day && !day.empty ? day.value : null
  })()
  // Play order matters: a group off the 10th is "on the 3rd" after hole 18 and holes 1–2.
  const groupOf = (pid: string) => (round ? snapshot.groups.find((g) => g.roundId === round.id && g.playerIds.includes(pid)) : undefined)
  const leadHole = (() => {
    if (!round || !roundState) return 0
    let best = 0
    let bestThru = -1
    for (const g of snapshot.groups.filter((x) => x.roundId === round.id)) {
      const prs = g.playerIds.map((pid) => roundState[pid]).filter((pr): pr is NonNullable<typeof pr> => !!pr)
      const thru = Math.max(0, ...prs.map((pr) => pr.thru))
      if (thru > bestThru && prs.length) {
        bestThru = thru
        const lead = prs.reduce((a, b) => (b.thru > a.thru ? b : a))
        best = thru === 0 ? 0 : currentHole(lead.holes, g.startHole, round.holes)
      }
    }
    return best
  })()
  const lastHole = (pid: string) => (roundState?.[pid] && round ? lastPlayedHole(roundState[pid]!.holes, groupOf(pid)?.startHole ?? 1, round.holes) : null)
  /** Re-sort animation only on boards small enough for it to read; big fields just re-render. */
  const animate = rows.length <= 20
  const hasHandicaps = Object.values(state.core.handicaps).some((h) => h.base > 0)

  /**
   * The hole I am standing on, when I am playing a live round.
   *
   * Scoring was two taps from here — Tarjeta, then find the hole — which is
   * two taps too many for the thing the app exists to do. This is one, and it
   * lands on the right hole.
   */
  const myHole = (() => {
    if (!round || round.status !== 'live' || !me.playerId) return null
    const group = groupOf(me.playerId)
    const pr = roundState?.[me.playerId]
    if (!group || !pr) return null
    return { hole: currentHole(pr.holes, group.startHole, round.holes), thru: pr.thru }
  })()

  const statusLine = round ? `${t.round.day(round.number)}, ${t.roundStatus[round.status].toLowerCase()}` : t.status[snapshot.tournament.status as keyof typeof t.status] ?? snapshot.tournament.status
  const lead = round?.status === 'live' && leadHole > 0 ? t.live.leadGroup(leadHole) : null

  /*
   * The Puntos/Gross toggle only says something under Stableford, where the
   * board's figure is points and gross is the second reading. Under stroke
   * play the figure already is gross or net, and a match or a team score has
   * no gross reading at all.
   */
  const canToggleGross = hasHandicaps && board?.formatId === 'stableford'
  const grossView = canToggleGross && view === 'gross'
  const roundIdx = round ? state.core.roundIds.indexOf(round.id) : -1
  // The honoree's card speaks the event's figure (STRAT-03): «+5 neto», «hoy ganó 3&2», «hoyo 7: bogey neto».
  const scoring = mainScoring(settings)
  const spotlightFigure = (row: (typeof rows)[number], h: ReturnType<typeof lastHole>) => {
    const day = roundIdx >= 0 ? row.perRound[roundIdx] : undefined
    const today = !day || day.empty ? null : day.result ? t.live.matchDay(day.result, day.text) : day.text
    const last = h ? t.feed.scoreName(h.pickedUp ? null : (holeStrokes(h, scoring === 'net') ?? h.par) - h.par, scoring === 'net') : null
    return t.live.spotlightFigure(row.label, t.common.figure(row.figure.text, row.figure.value, figureKind(settings)), today, h?.hole ?? null, last)
  }

  // Gross view: same players, sorted by strokes to par over the holes played. Display only.
  const grossRows = grossView ? [...rows].map((r) => ({ r, d: grossToPar(state, r.playerId) })).sort((a, b) => (a.d ?? Infinity) - (b.d ?? Infinity)) : null
  const grossLabel = (i: number) => {
    if (!grossRows) return ''
    const d = grossRows[i]!.d
    let first = i
    while (first > 0 && grossRows[first - 1]!.d === d) first--
    const tied = (i > 0 && grossRows[i - 1]!.d === d) || (i < grossRows.length - 1 && grossRows[i + 1]!.d === d)
    return `${tied ? 'T' : ''}${first + 1}`
  }

  const list = grossRows ? grossRows.map((g) => g.r) : rows

  return (
    <div className={styles.screen}>
      {/* The tournament's home page is named after it, for headings and for focus after a page change (A11Y-13); the header shows the name. */}
      <h1 className="sr-only">{snapshot.tournament.name}</h1>
      <DemoIntro />
      {/* A side game this build doesn't know may move money: no screen shows any, and this says why (ARCH-04). Settings it can't read at
          all never reach this screen (SettingsGuard). */}
      {state.flags.moneyUnknown.length > 0 && (
        <div className="card card--alert" role="note">
          <p>{t.outdated.money(state.flags.moneyUnknown)}</p>
        </div>
      )}

      <QuickFinish />
      {/* After the PIN the player lands here: this phone's way to install, until it has the app (PWA-08). Not on a link to
          watch (STRAT-05): the installed app opens Home, never the link, and on an iPhone it keeps nothing of Safari's. */}
      {!spectator && <InstallCard />}
      {/* In the installed app, once this phone's player saved a hole: the tournament's notices (PWA-10). */}
      {!spectator && <TournamentPushOffer />}
      {/* Once, after the PIN: what the Comité saved about this player, and «Pedir corrección» (TRUST-16). */}
      {!spectator && <MyDataCard />}

      {/*
        VIS-20: who leads and where am I, above the fold on a 375×667 phone. The status and the lead group are one line,
        «Anotar el hoyo n» stands where the board's title was, the honoree's card follows the board (his row carries
        the ring): the first row went from 381 px to under 200, and 8 of 12 rows show instead of 4.
      */}
      <div className={styles.top}>
        <div className={styles.strip}>
          <p className={styles.status}>
            <span className={styles.stripMain}>{statusLine}</span>
            <DetailLine lead={lead} />
          </p>
          {!spectator && state.flags.pendingSnakeTiebreaks.length > 0 && (
            <span className={styles.caution}>
              <IconAlert size={16} /> {t.live.pendingSnake(state.flags.pendingSnakeTiebreaks.length, settings.modules.snake.label)}
            </span>
          )}
          {!spectator && state.flags.warnings.map(words).map((w) => (
            <span key={w} className={styles.caution}>
              <IconAlert size={16} /> {w}
            </span>
          ))}
          {/* A handicap changed after they were fixed (UX-28): everyone sees it, and a tap opens the player with the reason. */}
          {!spectator && state.flags.handicapChanges.map((c) => (
            <button key={c.playerId} type="button" className={`${styles.caution} ${styles.cautionLink}`} onClick={() => setOpen(c.playerId)}>
              <IconAlert size={16} /> {t.live.hcpChanged(byId.get(c.playerId)?.displayName ?? '?', hcpFromTo(c.from, c.to))}
            </button>
          ))}
        </div>

        {/* Terminado: a player on a PIN keeps the tournament in a profile (STRAT-08). */}
        {snapshot.tournament.status === 'finished' && <SaveResults />}

        {/* Before the first hole, the next day and this phone's place in it, above a board of zeros (STRAT-10). */}
        {isPreRound(data) && <PreRound />}

        <div className={styles.boardHead}>
          {/* The one tap that matters on a course, straight to the hole being played, where the title was: the board says what it is. */}
          <h2 className={myHole ? 'sr-only' : undefined}>{settings.modules.individual.label}</h2>
          {myHole && (
            <Link className={`btn btn--primary ${styles.scoreNow}`} to={`${base}/tarjeta?hoyo=${myHole.hole}`}>
              {myHole.thru >= (round?.holes ?? 18) ? t.live.scoreDone : t.live.scoreHole(myHole.hole)}
            </Link>
          )}
          {canToggleGross ? (
            <Segmented
              value={view}
              options={[
                { value: 'points', label: t.live.points },
                { value: 'gross', label: t.live.gross },
              ]}
              onChange={setView}
              label={t.live.boardIn}
            />
          ) : (
            <ShareCardButton what={LEADERBOARD} className="btn btn--ghost btn--sm" />
          )}
        </div>

        {rows.length === 0 ? (
          <EmptyState title={t.enter.noPlayers} body={t.enter.noPlayersHint} />
        ) : (
          <Board>
            <BoardHead figureLabel={grossView ? t.live.gross : board?.figureLabel ?? t.live.points} dense={rows.length > 20} />
            {list.map((r, i) => {
                const members = r.entrant.playerIds
                // The first member stands for a team when a row is tapped.
                const p = byId.get(members[0] ?? '')
                if (!p) return null
                const pr = roundState?.[p.id]
                const cash = showMoney ? members.reduce((a, id) => a + (state.money.people[id]?.prizesTotal ?? 0), 0) : 0
                let figure: string
                let tone: Tone = 'even'
                let today: string | undefined
                let todayTone: Tone | undefined
                let todaySpoken: string | undefined
                if (grossView) {
                  const d = grossToPar(state, p.id)
                  const tp = d == null ? null : toPar(d)
                  figure = tp ? tp.text : '–'
                  tone = tp ? tp.tone : 'even'
                  const td = round ? grossToPar(state, p.id, round.id) : null
                  today = td == null ? undefined : toPar(td).text
                } else {
                  figure = r.figure.text
                  tone = r.figure.tone === 'under' ? 'under' : r.figure.tone === 'over' ? 'over' : 'even'
                  ;({ today, todayTone, todaySpoken } = pointsDay(r, roundIdx))
                }
                // The last look counts on the board's own reading, the event's figure: Gross is the same rows another way.
                const seen = grossView ? undefined : since?.rows[r.playerId]
                // A team's "thru" is where its slowest member is.
                const thru = round ? Math.min(...members.map((id) => roundState?.[id]?.thru ?? 0)) : 0
                return (
                  <BoardRow
                    key={r.playerId}
                    playerId={p.id}
                    place={i}
                    animate={animate}
                    pos={grossView ? grossLabel(i) : r.label}
                    name={byTeam ? r.entrant.name : p.displayName}
                    teamNames={byTeam ? t.common.andList(members.map((id) => byId.get(id)?.displayName ?? id)) : null}
                    tier={p.tier ?? null}
                    estimated={!!state.core.handicaps[p.id]?.estimated}
                    cash={cash}
                    owners={byTeam ? undefined : owners.get(p.id)?.initials}
                    ownersSpoken={byTeam ? undefined : owners.get(p.id)?.spoken}
                    honoreeLabel={settings.labels.honoree}
                    unit={grossView ? 'toPar' : figureKind(settings)}
                    honoree={!!honoree && members.includes(honoree.id)}
                    today={today}
                    todayTone={todayTone}
                    todaySpoken={todaySpoken}
                    thru={round && (pr || byTeam) ? t.round.thru(thru, round.holes) : undefined}
                    figure={figure}
                    tone={tone}
                    mine={!!me.playerId && members.includes(me.playerId)}
                    movedBy={seen && !r.figure.empty ? seen.place - r.position : 0}
                    seenToday={seen && since?.round === roundId ? seen.today : undefined}
                    seenFigure={seen?.figure}
                    reading={grossView ? 'gross' : 'points'}
                    dense={rows.length > 20}
                    onOpen={setOpen}
                  />
                )
              })}
          </Board>
        )}
      </div>
      <div className="row row--between">
        {showMoney ? <span className="help">{t.money.ifEndedNow}</span> : <span />}
        {hasHandicaps && <ShareCardButton what={LEADERBOARD} className="btn btn--ghost btn--sm" />}
      </div>

      {honoree && honoreeRow && (
        <button type="button" className={styles.spotlight} onClick={() => setOpen(honoree.id)}>
          <Avatar name={honoree.displayName} url={honoree.avatarUrl} honoree />
          <span className={styles.spotlightText}>
            <span className={styles.spotlightName}>
              {settings.labels.honoree}: {honoree.displayName}
            </span>
            <span className={styles.spotlightLine}>
              {scoring === 'points'
                ? t.live.spotlight(honoreeRow.label, honoreeRow.total, honoreeToday, lastHole(honoree.id)?.hole ?? null, lastHole(honoree.id)?.points ?? null)
                : spotlightFigure(honoreeRow, lastHole(honoree.id))}
            </span>
          </span>
        </button>
      )}

      <h2 className={styles.feedHead}>{t.feed.title}</h2>
      <FeedTicker limit={10} />

      <SpectatorNote />

      <PlayerSheet playerId={open} onClose={closeSheet} />
    </div>
  )
}
