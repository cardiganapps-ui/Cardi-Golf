/**
 * PINs and invites in Comité › Jugadores (UX-20). Twelve PINs used to cost
 * some seventy inputs, each one invented and typed, then twelve WhatsApp
 * messages written by hand, and the Comité had to remember every PIN to send
 * it again; a mistyped one showed up only as a player locked out on the course.
 *
 * - «Generar PINs»: four random digits for every player without one, each
 *   saved through `set_player_pin` (the server keeps only its hash), then the
 *   «Lista de PINs» to read aloud, copy or print, with each player's invite.
 * - Each player's PIN sheet holds his invite: a link that opens Entrar on his
 *   face (`?soy=`), never with the PIN in it, and «Mandar por WhatsApp» with a
 *   message written for him, which carries the PIN only while it is on screen.
 *
 * A PIN is shown only until its sheet closes: then it is gone from this phone
 * too. It never reaches a log, a toast of an error or telemetry.
 */
import { useId, useState } from 'react'
import { t } from '../../i18n/es-MX'
import { CopyButton, Sheet } from '../../components/ui'
import { toast } from '../../components/toast'
import { ConfirmSheet } from '../../components/ConfirmSheet'
import { setPlayerPin } from '../../data/api'
import type { Player } from '../../engine/types'
import { inviteUrl, randomPins, shareToWhatsApp } from '../../lib/pins'
import a from './Admin.module.css'
import styles from './PinInvites.module.css'

const N = t.admin.players.pins

/** The message for one player: his invite, and his PIN when the Comité has it on screen. */
function inviteMessage(player: Pick<Player, 'id' | 'displayName'>, tournament: string, slug: string, pin: string | null): string {
  return N.invitation(player.displayName, tournament, inviteUrl(window.location.origin, slug, player.id), pin)
}

/** A player's invite, in his PIN sheet: the link to copy, and the message to send. */
export function InviteBlock({ player, tournament, slug, pin }: { player: Player; tournament: string; slug: string; pin: string | null }) {
  return (
    <section className="stack" aria-label={N.invite}>
      <span className="label">{N.invite}</span>
      <p className={a.help}>{N.inviteHint}</p>
      <div className={a.chipRow}>
        <button className="btn btn--primary btn--sm" type="button" onClick={() => void shareToWhatsApp(inviteMessage(player, tournament, slug, pin))}>
          {N.whatsapp}
        </button>
        <CopyButton text={inviteUrl(window.location.origin, slug, player.id)} label={N.copyLink} />
      </div>
    </section>
  )
}

/** The section above the roster: how many still need a PIN, «Generar PINs», and the list of the PINs just made. */
export function PinTools({ players, pins, tournament, slug, onSaved }: { players: Player[]; pins: Set<string>; tournament: string; slug: string; onSaved: (ids: string[]) => void }) {
  const missing = players.filter((p) => !pins.has(p.id))
  const [ask, setAsk] = useState(false)
  const [progress, setProgress] = useState<{ done: number; of: number } | null>(null)
  /** The PINs just made, in the roster's order: on this phone only while the list is open. */
  const [made, setMade] = useState<Array<{ player: Player; pin: string }>>([])
  const titleId = useId()

  async function generate() {
    const todo = missing
    const fresh = randomPins(todo.length)
    const ok: Array<{ player: Player; pin: string }> = []
    let failed = 0
    setProgress({ done: 0, of: todo.length })
    // One at a time: each is its own call (the server hashes it), and a failure leaves the others saved.
    for (const [i, player] of todo.entries()) {
      try {
        await setPlayerPin(player.id, fresh[i]!)
        ok.push({ player, pin: fresh[i]! })
      } catch {
        // Never the error's text: nothing about a PIN goes to a toast, a log or telemetry.
        failed++
      }
      setProgress({ done: i + 1, of: todo.length })
    }
    setProgress(null)
    setAsk(false)
    if (ok.length) {
      onSaved(ok.map((x) => x.player.id))
      setMade(ok)
    }
    if (failed) toast(N.failed(failed))
  }

  const listText = made.map((m) => N.listLine(m.player.fullName, m.pin)).join('\n')
  return (
    <section className={a.section} aria-labelledby={titleId}>
      <div className={a.sectionTitle}>
        <strong id={titleId}>{N.title}</strong>
        {missing.length > 0 && (
          <button className="btn btn--secondary btn--sm" type="button" onClick={() => setAsk(true)}>
            {N.generate}
          </button>
        )}
      </div>
      <p className={a.help}>{missing.length > 0 ? N.missing(missing.length) : N.allSet}</p>

      <ConfirmSheet
        open={ask}
        title={N.generateTitle}
        body={N.generateBody(missing.length)}
        confirmLabel={progress ? N.generating(progress.done, progress.of) : N.generate}
        busy={!!progress}
        onConfirm={() => void generate()}
        onClose={() => !progress && setAsk(false)}
      />

      <Sheet open={made.length > 0} onClose={() => setMade([])} title={N.list}>
        <div className={`stack ${styles.printable}`}>
          <p className={a.help}>{N.listHint}</p>
          <div className={a.rows}>
            {made.map(({ player, pin }) => (
              <div key={player.id} className={a.row}>
                <span className={a.rowText}>
                  <span className={a.rowTitle}>{player.fullName}</span>
                </span>
                <span className={styles.pin}>{pin}</span>
                <button className={`btn btn--ghost btn--sm ${styles.noPrint}`} type="button" aria-label={N.whatsappTo(player.displayName)} onClick={() => void shareToWhatsApp(inviteMessage(player, tournament, slug, pin))}>
                  {N.send}
                </button>
              </div>
            ))}
          </div>
          <div className={`${a.chipRow} ${styles.noPrint}`}>
            <CopyButton text={listText} label={N.copyList} />
            <button className="btn btn--secondary btn--sm" type="button" onClick={() => window.print()}>
              {N.print}
            </button>
          </div>
        </div>
      </Sheet>
    </section>
  )
}
