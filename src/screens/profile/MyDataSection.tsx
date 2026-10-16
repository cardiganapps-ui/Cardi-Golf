/**
 * «Tus datos» in Editar perfil (0070, TRUST-09): «Descargar mis datos» saves
 * one JSON file with everything Polo keeps about this person, and «Borrar mi
 * cuenta» deletes the account as the Admin de Polo would, once its email is
 * typed. What the deletion takes and leaves is said first, from the server
 * (my_delete_preview): the players that become «Jugador borrado», the
 * tournaments left with no Comité, the crews handed on. Not while this phone
 * holds writes nobody else can send; signed out after, and home.
 */
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { t } from '../../i18n/es-MX'
import { Field, toast } from '../../components/ui'
import { Input } from '../../components/primitives'
import { ConfirmSheet } from '../../components/ConfirmSheet'
import { deleteMyAccount, downloadMyData, myDeletePreview, type DeletePreview } from '../../data/myData'
import { humanError } from '../../lib/humanError'
import styles from './Profile.module.css'

const D = t.profile.myData

export function MyDataSection({ email }: { email: string }) {
  const navigate = useNavigate()
  const [downloading, setDownloading] = useState(false)
  const [asking, setAsking] = useState(false)
  const [preview, setPreview] = useState<DeletePreview | null>(null)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const matches = typed.trim().toLowerCase() === email.trim().toLowerCase()

  async function download() {
    setDownloading(true)
    try {
      await downloadMyData()
      toast(D.downloaded)
    } catch (e) {
      toast(humanError(e))
    } finally {
      setDownloading(false)
    }
  }

  function ask() {
    setTyped('')
    setError(null)
    setPreview(null)
    setAsking(true)
    // What it takes and leaves, said in the sheet once the server answers; the sheet works without it.
    myDeletePreview().then(setPreview, () => undefined)
  }

  async function remove() {
    if (!matches) {
      setError(D.confirmEmail(email))
      return
    }
    setBusy(true)
    setError(null)
    try {
      const r = await deleteMyAccount(typed.trim())
      if (!r.done) {
        setError(r.reason)
        return
      }
      setAsking(false)
      toast(D.deleted)
      navigate('/', { replace: true })
    } catch (e) {
      setError(humanError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className={styles.section} aria-labelledby="my-data-title">
      <span className="label" id="my-data-title">
        {D.title}
      </span>
      <span className={styles.help}>{D.downloadHint}</span>
      <div className={styles.askActions}>
        <button className="btn btn--secondary btn--sm" type="button" disabled={downloading} onClick={() => void download()}>
          {downloading ? D.downloading : D.download}
        </button>
      </div>
      <span className={styles.help}>{D.deleteHint}</span>
      <div className={styles.askActions}>
        <button className="btn btn--ghost btn--sm" type="button" onClick={ask}>
          {D.delete}
        </button>
      </div>
      <ConfirmSheet open={asking} title={D.deleteTitle} body={D.deleteBody} confirmLabel={D.deleteConfirm} danger busy={busy} onConfirm={() => void remove()} onClose={() => setAsking(false)}>
        {preview && preview.anonymizedPlayers > 0 && <p className={styles.help}>{D.deletePlayers(preview.anonymizedPlayers, preview.anonymizedIn)}</p>}
        {preview && preview.orphaned.length > 0 && <p className="error">{D.deleteOrphaned(preview.orphaned.map((o) => o.name))}</p>}
        {preview && preview.crewsHanded.length > 0 && <p className={styles.help}>{D.deleteCrewsHanded(preview.crewsHanded)}</p>}
        {preview && preview.crewsDeleted.length > 0 && <p className={styles.help}>{D.deleteCrewsGone(preview.crewsDeleted)}</p>}
        <p className={styles.help}>{D.deleteKept}</p>
        <Field label={D.confirmEmail(email)} error={error}>
          <Input value={typed} type="email" autoComplete="off" autoCapitalize="none" spellCheck={false} onChange={(e) => setTyped(e.target.value)} />
        </Field>
      </ConfirmSheet>
    </section>
  )
}
