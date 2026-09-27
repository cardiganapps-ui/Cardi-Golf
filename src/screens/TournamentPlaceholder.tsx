import { Link, useParams } from 'react-router'
import { t } from '../i18n/es-MX'
import { Wordmark } from '../components/Wordmark'
import { Wave } from '../components/Wave'

/** `/t/:slug` and `/tv` land here until M2 (auth + data) and M3 (live board). */
export function TournamentPlaceholder({ mode = 'app' }: { mode?: 'app' | 'tv' }) {
  const { slug } = useParams()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 32 }}>
      <Wordmark />
      <Wave />
      <h1>{mode === 'tv' ? 'Modo TV' : (slug ?? t.enter.title)}</h1>
      <p className="muted">{t.home.comingSoon}</p>
      <Link className="btn btn--secondary" to="/">
        {t.errors.backHome}
      </Link>
    </div>
  )
}
