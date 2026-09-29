/**
 * `/ronda`: Ronda rápida. Who plays (you, friends, guests, each with the
 * index they play off), where (a course and a tee), what (the side-game
 * chips and, optionally, money), then "Empezar": one call creates the live
 * round and opens the Tarjeta.
 */
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { t } from '../../i18n/es-MX'
import { Avatar, Field, Spinner, Toggle, toast } from '../../components/ui'
import { IconChevronLeft, IconClose, IconPlus } from '../../components/icons'
import { listCourses, loadCourseDraft } from '../../data/api'
import { formatIndex, parseIndex, useMyProfile } from '../../data/profiles'
import { myFriends, type FriendCard } from '../../data/social'
import { createQuickRound, type QuickPlayer, type QuickRoundInput } from '../../data/quick'
import { QUICK_GAMES, quickSettings, quickSplit, type QuickGame } from '../../engine/games/quick'
import { formatMoney } from '../../lib/money'
import { useRequireAccount } from './useRequireAccount'
import styles from './Profile.module.css'

const Q = t.quick
const MAX = 16

export interface QuickCourse {
  id: string
  name: string
  location: string | null
}
export interface QuickTee {
  id: string
  name: string
  rating: number | null
  slope: number | null
  holes: number
}

interface Guest {
  key: number
  name: string
  index: string
}

export interface QuickRoundData {
  me: { displayName: string; avatarUrl: string | null; index: number | null }
  friends: FriendCard[]
  courses: QuickCourse[]
  loadTees: (courseId: string) => Promise<QuickTee[]>
  onStart: (input: QuickRoundInput) => Promise<void>
}

const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const dayMonth = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const showIndex = (v: number | null) => (v == null ? '' : formatIndex(v))

export function QuickRoundView({ me, friends, courses, loadTees, onStart }: QuickRoundData) {
  const [date, setDate] = useState(today())
  const [courseId, setCourseId] = useState(courses[0]?.id ?? '')
  const [tees, setTees] = useState<QuickTee[] | null>(null)
  const [teeId, setTeeId] = useState('')
  const [myIndex, setMyIndex] = useState(showIndex(me.index))
  const [picked, setPicked] = useState<Map<string, string>>(new Map())
  const [guests, setGuests] = useState<Guest[]>([])
  const [guestName, setGuestName] = useState('')
  const [games, setGames] = useState<QuickGame[]>(['skins'])
  const [money, setMoney] = useState(false)
  const [fee, setFee] = useState('200')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!courseId) return
    let live = true
    setTees(null)
    loadTees(courseId)
      .then((list) => {
        if (!live) return
        setTees(list)
        setTeeId(list.find((x) => x.holes === 18)?.id ?? list[0]?.id ?? '')
      })
      .catch(() => live && setTees([]))
    return () => {
      live = false
    }
  }, [courseId, loadTees])

  const course = courses.find((c) => c.id === courseId)
  const tee = tees?.find((x) => x.id === teeId)
  const count = 1 + picked.size + guests.length
  const feeNum = Math.max(0, Math.round(Number(fee) || 0))
  const autoName = course ? Q.defaultName(course.name, dayMonth.format(new Date(`${date}T12:00:00Z`))) : Q.title
  const ready = !!course && !!tee && tee.holes === 18 && count <= MAX && !busy

  const potLine = useMemo(() => {
    if (!money || feeNum <= 0) return null
    const split = quickSplit(count)
    return Q.potLine(formatMoney(feeNum * count), split.length === 1 ? 'todo al primero' : split.map((x) => `${x}%`).join(' / '))
  }, [money, feeNum, count])

  function toggleFriend(f: FriendCard) {
    setPicked((cur) => {
      const next = new Map(cur)
      if (next.has(f.handle)) next.delete(f.handle)
      else next.set(f.handle, showIndex(f.index))
      return next
    })
  }

  function addGuest() {
    const n = guestName.trim()
    if (!n) return
    setGuests((g) => [...g, { key: Date.now(), name: n, index: '' }])
    setGuestName('')
  }

  async function start() {
    if (!ready || !course || !tee) return
    const players: QuickPlayer[] = [
      { kind: 'me', index: parseIndex(myIndex) },
      ...[...picked.entries()].map(([handle, idx]) => ({ kind: 'friend' as const, handle, index: parseIndex(idx) })),
      ...guests.map((g) => ({ kind: 'guest' as const, name: g.name, index: parseIndex(g.index) })),
    ]
    setBusy(true)
    try {
      await onStart({
        name: name.trim() || autoName,
        settings: quickSettings({ games, money, entryFee: feeNum, players: count }),
        courseId: course.id,
        teeId: tee.id,
        date,
        players,
      })
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  const indexInput = (value: string, onChange: (v: string) => void, label: string) => (
    <input className={`input ${styles.indexInput}`} inputMode="decimal" placeholder={Q.index} aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} />
  )

  return (
    <div className={styles.screen}>
      <div className={styles.topBar}>
        <Link to="/" className={styles.iconBtn} aria-label={t.common.back}>
          <IconChevronLeft />
        </Link>
        <h1 className={styles.title}>{Q.title}</h1>
        <span className={styles.iconSpacer} />
      </div>

      {/* Where and when */}
      <section className={styles.section}>
        <span className="label">{Q.course}</span>
        {courses.length === 0 ? (
          <p className={styles.help}>{Q.noCourses}</p>
        ) : (
          <div className="stack">
            <Field label={Q.coursePick}>
              <select className="input" value={courseId} onChange={(e) => setCourseId(e.target.value)}>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.location ? `${c.name}, ${c.location}` : c.name}
                  </option>
                ))}
              </select>
            </Field>
            {tees === null ? (
              <Spinner />
            ) : (
              <Field label={Q.tee} hint={tee && tee.holes !== 18 ? Q.teeIncomplete : Q.teeHint}>
                <select className="input" value={teeId} onChange={(e) => setTeeId(e.target.value)}>
                  {tees.map((x) => (
                    <option key={x.id} value={x.id}>
                      {[x.name, x.rating != null && x.slope != null ? `${x.rating} / ${x.slope}` : null].filter(Boolean).join(', ')}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <Field label={Q.when}>
              <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value || today())} />
            </Field>
          </div>
        )}
        <Link to={`/campos?next=${encodeURIComponent('/ronda')}`} className={`btn btn--ghost btn--sm ${styles.start}`}>
          {Q.addCourse}
        </Link>
      </section>

      {/* Who */}
      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <span className="label">{Q.who}</span>
          <span className={styles.help}>{count > MAX ? Q.tooMany : Q.groups(Math.ceil(count / 4))}</span>
        </div>
        <div className={styles.rows}>
          <div className={styles.row}>
            <Avatar name={me.displayName} url={me.avatarUrl} />
            <span className={styles.rowText}>
              <span className={styles.rowTitle}>{me.displayName}</span>
              <span className={styles.rowSub}>{Q.you}</span>
            </span>
            {indexInput(myIndex, setMyIndex, Q.indexLabel(Q.you))}
          </div>
          {guests.map((g) => (
            <div key={g.key} className={styles.row}>
              <Avatar name={g.name} />
              <span className={styles.rowText}>
                <span className={styles.rowTitle}>{g.name}</span>
                <span className={styles.rowSub}>{Q.guest}</span>
              </span>
              {indexInput(g.index, (v) => setGuests((all) => all.map((x) => (x.key === g.key ? { ...x, index: v } : x))), Q.indexLabel(g.name))}
              <button type="button" className={styles.iconBtn} aria-label={Q.remove(g.name)} onClick={() => setGuests((all) => all.filter((x) => x.key !== g.key))}>
                <IconClose size={20} />
              </button>
            </div>
          ))}
        </div>

        <span className="label">{Q.friends}</span>
        {friends.length === 0 ? (
          <p className={styles.help}>{Q.noFriends}</p>
        ) : (
          <>
            <p className={styles.help}>{Q.friendsHint}</p>
            <div className={styles.rows}>
              {friends.map((f) => {
                const on = picked.has(f.handle)
                return (
                  <div key={f.handle} className={`${styles.row} ${on ? styles.rowUsed : ''}`}>
                    <label className={styles.personLink}>
                      <input type="checkbox" className={styles.check} checked={on} onChange={() => toggleFriend(f)} />
                      <Avatar name={f.displayName} url={f.avatarUrl} />
                      <span className={styles.rowText}>
                        <span className={styles.rowTitle}>{f.displayName}</span>
                        <span className={styles.rowSub}>@{f.handle}</span>
                      </span>
                    </label>
                    {on && indexInput(picked.get(f.handle) ?? '', (v) => setPicked((cur) => new Map(cur).set(f.handle, v)), Q.indexLabel(f.displayName))}
                  </div>
                )
              })}
            </div>
          </>
        )}

        <span className="label">{Q.guests}</span>
        <p className={styles.help}>{Q.guestsHint}</p>
        <form
          className={styles.joinForm}
          onSubmit={(e) => {
            e.preventDefault()
            addGuest()
          }}
        >
          <input className="input" placeholder={Q.guestName} aria-label={Q.guestName} value={guestName} onChange={(e) => setGuestName(e.target.value)} />
          <button className="btn btn--secondary" type="submit" disabled={!guestName.trim()}>
            <IconPlus size={18} /> {Q.addGuest}
          </button>
        </form>
      </section>

      {/* What */}
      <section className={styles.section}>
        <span className="label">{Q.games}</span>
        <p className={styles.help}>{Q.gamesHint}</p>
        <div className={styles.chips}>
          {QUICK_GAMES.map((g) => {
            const on = games.includes(g)
            return (
              <button key={g} type="button" aria-pressed={on} className={`${styles.pick} ${on ? styles.pickOn : ''}`} onClick={() => setGames((cur) => (on ? cur.filter((x) => x !== g) : [...cur, g]))}>
                {Q.game[g]}
              </button>
            )
          })}
        </div>
        <Toggle label={Q.money} hint={Q.moneyHint} checked={money} onChange={setMoney} />
        {money && (
          <Field label={Q.entryFee} hint={potLine ?? undefined}>
            <input className="input" inputMode="numeric" value={fee} onChange={(e) => setFee(e.target.value.replace(/[^0-9]/g, ''))} />
          </Field>
        )}
      </section>

      <section className={styles.section}>
        <Field label={Q.name}>
          <input className="input" placeholder={autoName} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <button className="btn btn--primary" type="button" disabled={!ready} onClick={() => void start()}>
          {busy ? Q.starting : Q.start}
        </button>
      </section>
    </div>
  )
}

async function loadTees(courseId: string): Promise<QuickTee[]> {
  const d = await loadCourseDraft(courseId)
  return d.tees.map((x) => ({ id: x.id!, name: x.name, rating: x.rating, slope: x.slope, holes: x.holes.length }))
}

export function QuickRoundScreen() {
  const ok = useRequireAccount('/ronda')
  const navigate = useNavigate()
  const { profile, load } = useMyProfile()
  const [friends, setFriends] = useState<FriendCard[] | null>(null)
  const [courses, setCourses] = useState<QuickCourse[] | null>(null)

  useEffect(() => {
    if (!ok) return
    if (!profile) void load(true)
    myFriends()
      .then((f) => setFriends(f.friends))
      .catch(() => setFriends([]))
    listCourses()
      .then((c) => setCourses(c.filter((x) => x.tees > 0)))
      .catch(() => setCourses([]))
  }, [ok, profile, load])

  if (!ok || !profile || !friends || !courses) return <Spinner />
  const index = profile.indexSource === 'manual' ? profile.manualIndex : profile.poloIndex
  return (
    <QuickRoundView
      me={{ displayName: profile.displayName, avatarUrl: profile.avatarUrl, index }}
      friends={friends}
      courses={courses}
      loadTees={loadTees}
      onStart={async (input) => {
        const r = await createQuickRound(input)
        navigate(`/t/${r.slug}/tarjeta`)
      }}
    />
  )
}
