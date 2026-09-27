import { t } from '../../i18n/es-MX'

export function PlaceholderScreen({ title }: { title: string }) {
  return (
    <div className="screen">
      <h1>{title}</h1>
      <p className="muted">{t.live.comingSoon}</p>
    </div>
  )
}
