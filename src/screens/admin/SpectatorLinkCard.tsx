/**
 * Comité › Torneo › Estado: the link to watch the tournament without a PIN
 * (STRAT-05, 0053). Off until the Comité makes it, «Sin dinero» unless it
 * chooses «Con dinero». Its token is read from the server whenever the card
 * opens: only the Comité reads it, and nothing else on the phone keeps it.
 *
 * «Cambiar enlace» gives it a new token (the old one stops at once, the TV's
 * too), «Apagar» takes it away. Turning money on for a link that already
 * exists asks first: whoever has it sees the money from then on.
 *
 * Each save sends the link as this card shows it, and the server refuses one
 * whose link changed meanwhile (another Comité phone made it, changed it or
 * switched it off): a stale «Crear» or «Cambiar enlace» would otherwise turn a
 * shared «Sin dinero» link into «Con dinero» without that question. Refused,
 * the card says why and reads the link again.
 */
import { useCallback, useEffect, useState } from 'react'
import { t } from '../../i18n/es-MX'
import { ConfirmSheet } from '../../components/ConfirmSheet'
import { CopyButton, ErrorBox, Segmented, ShareButton, Spinner } from '../../components/ui'
import { toast } from '../../components/toast'
import { deleteSpectatorLink, saveSpectatorLink, spectatorLink, spectatorUrl, type SpectatorLink } from '../../data/spectator'
import { useTournament } from '../../data/tournamentStore'
import { humanError } from '../../lib/humanError'
import { useTournamentCtx } from '../tournament/tournamentContext'
import a from './Admin.module.css'

const S = t.spectator
/** A database without 0053 answers these: the card says so, never an error. */
const MISSING = new Set(['PGRST202', '42883'])

type Money = 'none' | 'money'
type Load = { status: 'loading' } | { status: 'ready'; link: SpectatorLink | null } | { status: 'unavailable' } | { status: 'error'; error: unknown }

export function SpectatorLinkCard() {
  const { tournamentId } = useTournamentCtx()
  const name = useTournament((s) => s.data?.snapshot.tournament.name ?? '')
  const [load, setLoad] = useState<Load>({ status: 'loading' })
  /** What a link not made yet will show: «Sin dinero» unless the Comité says otherwise. */
  const [choice, setChoice] = useState<Money>('none')
  const [busy, setBusy] = useState(false)
  const [ask, setAsk] = useState<'rotate' | 'off' | 'money' | null>(null)

  const read = useCallback(async () => {
    try {
      setLoad({ status: 'ready', link: await spectatorLink(tournamentId) })
    } catch (e) {
      setLoad(MISSING.has((e as { code?: string } | null)?.code ?? '') ? { status: 'unavailable' } : { status: 'error', error: e })
    }
  }, [tournamentId])
  useEffect(() => {
    void read()
  }, [read])

  /**
   * One change, then the link as the server holds it now. Refused (another Comité phone changed the link
   * meanwhile, or anything else), the toast says why and the card reads the link again, so what it shows
   * next is the link as it is.
   */
  async function run(change: () => Promise<SpectatorLink | null>, done: string) {
    setBusy(true)
    try {
      const link = await change()
      setLoad({ status: 'ready', link })
      toast(done)
    } catch (e) {
      toast(humanError(e))
      void read()
    } finally {
      setBusy(false)
      setAsk(null)
    }
  }

  const link = load.status === 'ready' ? load.link : null
  const url = link ? spectatorUrl(link.token) : ''
  const shown: Money = link ? (link.money ? 'money' : 'none') : choice

  return (
    <section className={a.section} aria-labelledby="spectator-link">
      <div className={a.sectionTitle}>
        <strong id="spectator-link">{S.title}</strong>
        {busy && <span className={a.count}>{t.common.saving}</span>}
      </div>
      <p className={a.help}>{S.hint}</p>
      {load.status === 'loading' && <Spinner rows={1} />}
      {load.status === 'unavailable' && <p className={a.help}>{S.unavailable}</p>}
      {load.status === 'error' && <ErrorBox error={load.error} onRetry={() => void read()} />}
      {load.status === 'ready' && (
        <>
          <span className="label">{S.moneyLabel}</span>
          <Segmented
            label={S.moneyLabel}
            value={shown}
            options={[
              { value: 'none', label: S.noMoney },
              { value: 'money', label: S.withMoney },
            ]}
            onChange={(v) => {
              if (!link) return setChoice(v)
              if (busy || v === shown) return
              // Money on: whoever already has the link sees it from now on, so it asks first.
              if (v === 'money') setAsk('money')
              else void run(() => saveSpectatorLink(tournamentId, false, link), S.moneyOff)
            }}
          />
          <p className={a.help}>{shown === 'money' ? S.withMoneyHint : S.noMoneyHint}</p>
          {link ? (
            <>
              <span className={a.link}>{url}</span>
              <div className={a.chipRow}>
                <CopyButton text={url} />
                <ShareButton text={S.shareText(name)} url={url} title={name} />
                <a className="btn btn--ghost btn--sm" href={`${url}/tv`} target="_blank" rel="noopener">
                  {S.tv}
                </a>
              </div>
              <div className={a.chipRow}>
                <button className="btn btn--ghost btn--sm" type="button" disabled={busy} onClick={() => setAsk('rotate')}>
                  {S.rotate}
                </button>
                <button className="btn btn--ghost btn--sm" type="button" disabled={busy} onClick={() => setAsk('off')}>
                  {S.off}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className={a.help}>{S.none}</p>
              <button className="btn btn--secondary" type="button" disabled={busy} onClick={() => void run(() => saveSpectatorLink(tournamentId, choice === 'money', null), S.created)}>
                {S.create}
              </button>
            </>
          )}
        </>
      )}
      <ConfirmSheet
        open={ask === 'rotate'}
        title={S.rotate}
        body={S.rotateBody}
        confirmLabel={S.rotate}
        busy={busy}
        onConfirm={() => void run(() => saveSpectatorLink(tournamentId, link?.money ?? false, link, true), S.rotated)}
        onClose={() => setAsk(null)}
      />
      <ConfirmSheet
        open={ask === 'off'}
        title={S.off}
        body={S.offBody}
        confirmLabel={S.off}
        danger
        busy={busy}
        onConfirm={() =>
          void run(async () => {
            await deleteSpectatorLink(tournamentId)
            return null
          }, S.turnedOff)
        }
        onClose={() => setAsk(null)}
      />
      <ConfirmSheet open={ask === 'money'} title={S.moneyOnTitle} body={S.moneyOnBody} confirmLabel={S.withMoney} busy={busy} onConfirm={() => void run(() => saveSpectatorLink(tournamentId, true, link), S.moneyOn)} onClose={() => setAsk(null)} />
    </section>
  )
}
