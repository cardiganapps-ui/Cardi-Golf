import { test } from 'vitest'
import { getFixture } from '/home/user/Cardi-Golf/src/dev/fixtures'
import { computeTournament } from '/home/user/Cardi-Golf/src/engine/computeTournament'
import { computeFeed } from '/home/user/Cardi-Golf/src/engine/core/feed'

test('feed lead changes vs board leader, per format', () => {
  for (const name of ['stroke8', 'match8', 'team8', 'full12-live', 'minimal4-live']) {
    const f = getFixture(name)!
    const settings = (f.snapshot.tournament as any).settings
    const state: any = computeTournament(f.snapshot, settings)
    const feed = computeFeed(f.snapshot, state.core, state.modules.snake, 100000)
    const leads = feed.filter((e) => e.kind === 'leadChange')
    const lastLead = leads[0] // feed is newest first
    const boardLeader = state.modules.individual?.rows?.[0]
    const nameOf = (id: string) => f.snapshot.players.find((p) => p.id === id)?.displayName ?? id
    console.log(`${name}: format=${settings.modules.individual.format} leadChanges=${leads.length} lastLeadAnnounced=${lastLead ? nameOf(lastLead.playerId) + ' (' + lastLead.total + ' Stableford pts)' : '-'} boardLeader=${boardLeader ? (boardLeader.playerId ? nameOf(boardLeader.playerId) : JSON.stringify(boardLeader).slice(0,80)) : '-'}`)
  }
})
