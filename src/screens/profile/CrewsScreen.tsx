/**
 * `/crews`: my crews, create one, or enter one with its code. And
 * `/c/unirme/:code`: the link a crew shares; it shows the crew and joins.
 */
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { t } from '../../i18n/es-MX'
import { Field, Spinner, toast } from '../../components/ui'
import { EmptyState } from '../../components/primitives'
import { IconChevronLeft, IconChevronRight } from '../../components/icons'
import { createCrew, crewPreview, joinCrew, myCrews, type MyCrew } from '../../data/crews'
import { useRequireAccount } from './useRequireAccount'
import styles from './Profile.module.css'
import { humanError, UserError } from '../../lib/humanError'

const C = t.crews
const cleanCode = (v: string) => v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)

export function CrewsScreen() {
  const ok = useRequireAccount('/crews')
  const navigate = useNavigate()
  const [list, setList] = useState<MyCrew[] | null>(null)
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!ok) return
    myCrews()
      .then(setList)
      .catch(() => setList([]))
  }, [ok])

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    try {
      await fn()
    } catch (e) {
      toast(humanError(e))
    } finally {
      setBusy(false)
    }
  }

  const onCreate = (e: FormEvent) => {
    e.preventDefault()
    void run(async () => {
      const c = await createCrew(name.trim())
      navigate(`/c/${c.slug}`)
    })
  }
  const onJoin = (e: FormEvent) => {
    e.preventDefault()
    void run(async () => {
      const slug = await joinCrew(code)
      if (slug) navigate(`/c/${slug}`)
      else toast(C.badCode)
    })
  }

  if (!ok || !list) return <Spinner />
  return (
    <div className={styles.screen}>
      <div className={styles.topBar}>
        <Link to="/" className={styles.iconBtn} aria-label={t.common.back}>
          <IconChevronLeft />
        </Link>
        <h1 className={styles.title}>{C.title}</h1>
        <span className={styles.iconSpacer} />
      </div>
      <p className={styles.help}>{C.lede}</p>

      <section className={styles.section}>
        <span className="label">{C.mine}</span>
        {list.length === 0 ? (
          <p className={styles.help}>{C.none}</p>
        ) : (
          <div className={styles.rows}>
            {list.map((c) => (
              <Link key={c.id} to={`/c/${c.slug}`} className={styles.row}>
                <span className={styles.mono} aria-hidden="true">
                  {c.name.charAt(0).toUpperCase()}
                </span>
                <span className={styles.rowText}>
                  <span className={styles.rowTitle}>{c.name}</span>
                  <span className={styles.rowSub}>{[C.members(c.members), c.role === 'owner' ? C.owner : null].filter(Boolean).join(', ')}</span>
                </span>
                <span className={styles.rowEnd}>
                  <IconChevronRight size={20} />
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className={styles.section}>
        <span className="label">{C.join}</span>
        <form className={styles.joinForm} onSubmit={onJoin}>
          <input className={`input ${styles.codeInput}`} placeholder={C.joinPlaceholder} aria-label={C.join} value={code} onChange={(e) => setCode(cleanCode(e.target.value))} autoCapitalize="characters" autoComplete="off" maxLength={6} />
          <button className="btn btn--secondary" type="submit" disabled={busy || code.length !== 6}>
            {C.joinButton}
          </button>
        </form>
      </section>

      <section className={styles.section}>
        <span className="label">{C.create}</span>
        <form className="stack" onSubmit={onCreate}>
          <Field label={C.createName}>
            <input className="input" placeholder={C.createPlaceholder} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
          </Field>
          <button className={`btn btn--primary ${styles.start}`} type="submit" disabled={busy || name.trim().length < 2}>
            {C.createButton}
          </button>
        </form>
      </section>
    </div>
  )
}

export function CrewJoinScreen() {
  const { code = '' } = useParams()
  const ok = useRequireAccount(`/c/unirme/${code}`)
  const navigate = useNavigate()
  const [crew, setCrew] = useState<Awaited<ReturnType<typeof crewPreview>> | undefined>(undefined)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!ok) return
    crewPreview(code)
      .then(setCrew)
      .catch(() => setCrew(null))
  }, [ok, code])

  if (!ok || crew === undefined) return <Spinner />
  if (!crew) return <EmptyState title={C.badCode} body={C.lede} action={<Link className="btn btn--secondary" to="/crews">{C.title}</Link>} />
  return (
    <div className={`${styles.screen} ${styles.narrow}`}>
      <div className={styles.head}>
        <h1>{C.joinTitle(crew.name)}</h1>
        <p className={styles.lede}>{crew.isMember ? C.already : C.joinLine(crew.members)}</p>
      </div>
      {crew.isMember ? (
        <Link className="btn btn--primary" to={`/c/${crew.slug}`}>
          {crew.name}
        </Link>
      ) : (
        <button
          className="btn btn--primary"
          type="button"
          disabled={busy}
          onClick={() => {
            setBusy(true)
            joinCrew(code)
              .then((slug) => {
                if (!slug) throw new UserError(C.badCode)
                toast(C.joined(crew.name))
                navigate(`/c/${slug}`, { replace: true })
              })
              .catch((e) => {
                toast(humanError(e))
                setBusy(false)
              })
          }}
        >
          {C.joinCta}
        </button>
      )}
    </div>
  )
}
