import { expect, it } from 'vitest'
import { dataFromSnapshot } from '/home/user/Cardi-Golf/src/data/tournamentStore'
import { FIRST_TOURNAMENT_SETTINGS as F } from '/home/user/Cardi-Golf/src/engine/settings/presets'
import { fillRound, makeFirstTournament } from '/home/user/Cardi-Golf/src/engine/testing/fixtures'
it('a settings row written by a newer build (one extra game type) on an older client', () => {
  const snap = makeFirstTournament()
  fillRound(snap, 'r1', 11)
  const good = dataFromSnapshot(structuredClone(snap))
  snap.tournament.settings = { ...F, games: [{ id: 'wolf', type: 'wolf', label: 'Wolf', enabled: true, money: { source: 'none' }, options: {} }] }
  const skew = dataFromSnapshot(snap)
  const leader = (d: typeof good) => d.state.modules.individual?.rows[0]
  console.log(JSON.stringify({
    settingsError: skew.settingsError?.slice(0, 120),
    allowance: { current: good.settings.handicap.allowance, olderClient: skew.settings.handicap.allowance },
    modulesOn: { current: Object.entries(good.settings.modules).filter(([, m]) => m.enabled).map(([k]) => k), olderClient: Object.entries(skew.settings.modules).filter(([, m]) => m.enabled).map(([k]) => k) },
    prizesTotal: { current: good.state.prizes.reduce((s, p) => s + p.amount, 0), olderClient: skew.state.prizes.reduce((s, p) => s + p.amount, 0) },
    missingGamesWarning: skew.state.flags.missingGames,
    leaderPoints: { current: leader(good)?.total, olderClient: leader(skew)?.total },
  }, null, 1))
  expect(skew.settingsError).toBeNull()
})
