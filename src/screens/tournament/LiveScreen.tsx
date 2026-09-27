/**
 * En vivo (M2 version): tournament header, players with their handicaps and
 * a first individual table. M3 replaces the table with the animated
 * leaderboard, the spotlight and the feed.
 */
import { t } from '../../i18n/es-MX'
import { Avatar } from '../../components/ui'
import { useTournament } from '../../data/tournamentStore'
import { useTournamentCtx } from './TournamentGate'

export function LiveScreen() {
  const data = useTournament((s) => s.data)
  const { me } = useTournamentCtx()
  if (!data) return null
  const { snapshot, state, settings, settingsError } = data
  const rows = state.modules.individual?.rows ?? []
  const firstRound = state.core.roundIds[0]
  const byId = new Map(snapshot.players.map((p) => [p.id, p]))

  return (
    <div className="screen">
      {settingsError && (
        <div className="card" style={{ background: 'var(--coral)', color: '#fff' }}>
          <strong>{t.admin.tournament.invalid}</strong>
          <p className="small">{settingsError}</p>
        </div>
      )}
      {state.flags.warnings.map((w) => (
        <p key={w} className="help coral">
          {w}
        </p>
      ))}
      {snapshot.tournament.tagline && <p className="muted">{snapshot.tournament.tagline}</p>}
      <h2>{settings.modules.individual.label}</h2>
      {snapshot.rounds.length === 0 && <p className="help">{t.live.noRounds}</p>}
      {rows.length === 0 ? (
        <p className="muted">{t.enter.noPlayers}</p>
      ) : (
        <div className="list">
          {rows.map((r) => {
            const p = byId.get(r.playerId)!
            const pr = firstRound ? state.core.rounds[firstRound]?.[p.id] : undefined
            const mine = me.playerId === p.id
            return (
              <div key={p.id} className="listItem listItem--static" style={mine ? { background: 'var(--panel)' } : undefined}>
                <span className="num" style={{ width: 32, textAlign: 'center' }}>
                  {r.label}
                </span>
                <Avatar name={p.displayName} url={p.avatarUrl} honoree={p.isHonoree} />
                <span className="grow">
                  <strong>{p.displayName}</strong>
                  <span className="help" style={{ display: 'block' }}>
                    {p.tier && <span className="tierBadge" style={{ marginRight: 6 }}>{p.tier}</span>}
                    {t.live.hcp} {p.baseHcp}
                    {pr ? ` · ${t.live.playingHcp} ${pr.playingHcp}` : ''}
                    {state.core.handicaps[p.id]?.estimated ? ` · ${t.admin.players.estimated}` : ''}
                  </span>
                </span>
                <span className="num" style={{ fontSize: '1.3rem' }}>
                  {r.total}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
