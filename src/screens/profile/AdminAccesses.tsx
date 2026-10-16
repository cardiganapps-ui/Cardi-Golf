/**
 * «Accesos del administrador» in Editar perfil (0068, TRUST-22): each time
 * the Admin de Polo opened this account or one of its crews, or did
 * something with them, with his reason. The latest three, the rest a tap
 * away. Nothing at all on a database without 0068.
 */
import { useEffect, useState } from 'react'
import { t } from '../../i18n/es-MX'
import { myAdminAccesses, type AdminAccess } from '../../data/adminAccess'
import { relTime } from '../../lib/relTime'
import styles from './Profile.module.css'

const A = t.profile.adminAccess
const FIRST = 3

function line(e: AdminAccess): string {
  if (e.kind === 'crew') {
    const crew = e.crew ?? A.goneCrew
    return (A.crewLine[e.action] ?? A.crewOther)(crew)
  }
  return A.line[e.action] ?? A.other
}

export function AdminAccesses() {
  const [rows, setRows] = useState<AdminAccess[] | null | undefined>(undefined)
  const [all, setAll] = useState(false)
  useEffect(() => {
    let live = true
    myAdminAccesses().then(
      (r) => live && setRows(r),
      // A list that can't load is no reason to break the profile editor.
      () => live && setRows(null),
    )
    return () => {
      live = false
    }
  }, [])
  if (!rows) return null
  const shown = all ? rows : rows.slice(0, FIRST)
  return (
    <section className={styles.section} aria-labelledby="admin-access-title">
      <span className="label" id="admin-access-title">
        {A.title}
      </span>
      <span className={styles.help}>{A.hint}</span>
      {rows.length === 0 ? (
        <span className={styles.help}>{A.none}</span>
      ) : (
        <div className={styles.rows}>
          {shown.map((e) => (
            <div key={e.id} className={styles.row}>
              <span className={styles.rowText}>
                <span className={styles.rowTitle}>{line(e)}</span>
                <span className={styles.rowSub}>{[relTime(e.at), e.reason && A.reason(e.reason)].filter(Boolean).join(', ')}</span>
              </span>
            </div>
          ))}
        </div>
      )}
      {!all && rows.length > FIRST && (
        <button className="btn btn--ghost btn--sm" type="button" onClick={() => setAll(true)}>
          {A.more}
        </button>
      )}
    </section>
  )
}
