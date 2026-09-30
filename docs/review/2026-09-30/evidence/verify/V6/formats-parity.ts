// V6 (STRAT-03): does the rest of the product agree with the format's own board?
// Runs the app's pipeline (parseSettings + computeTournament) on the in-memory fixtures.
import { getFixture } from '/home/user/Cardi-Golf/src/dev/fixtures'
import { parseSettings } from '/home/user/Cardi-Golf/src/engine/settings/schema'
import { computeTournament } from '/home/user/Cardi-Golf/src/engine/computeTournament'

for (const name of ['full12-live', 'stroke8', 'match8', 'team8', 'bracket8', 'scramble8']) {
  const fx = getFixture(name)
  if (!fx) { console.log(name, 'MISSING'); continue }
  const snap = structuredClone(fx.snapshot)
  const settings = parseSettings(snap.tournament.settings)
  const st = computeTournament(snap, settings)
  const ind = st.modules.individual
  const players = new Map(snap.players.map((p) => [p.id, p.displayName]))
  const teamName = (id: string) => snap.teams.find((x) => x.id === id)?.name ?? snap.pairs.find((x) => x.id === id)?.name ?? null
  const label = (id: string) => players.get(id) ?? teamName(id) ?? `?(${id})`
  const leaders = ind?.rows.filter((r) => r.position === 1) ?? []
  const lastLead = st.feed.find((e) => e.kind === 'leadChange')
  const birdies = st.feed.filter((e) => e.kind === 'birdie')
  // what the ceremony prints under the champion (CeremonyScreen.tsx:137 → C.withPoints(r.total))
  const ceremony = leaders.map((r) => `${label(r.playerId)}: "${r.total} puntos"`)
  // what the race legend prints (StatsScreen.tsx:60-61 → nameOf(individual.rows[].playerId), '?' when not a player)
  const raceLegend = (ind?.rows ?? []).map((r) => players.get(r.playerId) ?? '?')
  const raceSeriesPresent = (ind?.rows ?? []).filter((r) => Object.values(st.stats.players).some((s) => s.playerId === r.playerId)).length
  console.log(JSON.stringify({
    fixture: name,
    format: ind?.formatId,
    figureLabel: ind?.figureLabel,
    byTeam: ind?.byTeam,
    rounds: snap.rounds.length,
    day2Cut: settings.day2Cut,
    boardLeader: leaders.map((r) => ({ who: label(r.playerId), figure: r.figure, total: r.total })),
    feedLastLeadChange: lastLead ? { who: label(lastLead.playerId), announcedTotal: lastLead.total, isPlayer: players.has(lastLead.playerId) } : null,
    feedAgreesWithBoard: lastLead ? leaders.some((r) => r.playerId === lastLead.playerId) : null,
    feedBirdieEvents: birdies.length,
    ceremonyChampionSub: ceremony,
    raceLegend: raceLegend.slice(0, 8),
    raceSeriesWithData: `${raceSeriesPresent}/${ind?.rows.length ?? 0}`,
  }))
}
