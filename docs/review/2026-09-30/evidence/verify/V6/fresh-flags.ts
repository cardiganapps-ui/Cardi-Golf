// V6: what the engine flags for a freshly created tournament (0 players, 0 rounds) with the wizard's settings.
import fs from 'node:fs'
import { computeTournament } from '/home/user/Cardi-Golf/src/engine/computeTournament'
import { safeParseSettings } from '/home/user/Cardi-Golf/src/engine/settings/schema'
const raw = JSON.parse(fs.readFileSync('/tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad/verify/evidence/V6/wizard-settings.json', 'utf8'))
const settings = safeParseSettings(raw)
if (!settings.success) throw new Error('bad settings')
const snap = {
  tournament: { id: 't', slug: 'copa', name: 'Copa', tagline: null, logoUrl: null, accentColor: null, joinCode: 'ABC123', status: 'setup', currentRoundId: null, bankerPlayerId: null, settings: raw, timezone: 'America/Mexico_City', currency: 'MXN' },
  players: [], courses: [], rounds: [], groups: [], roundTees: [], pairs: [], teams: [], scores: [], snakeTiebreaks: [], cardSignatures: [], handicapOverrides: [], calcuttaLots: [], calcuttaBids: [], calcuttaBuybacks: [], payments: [], gameEntries: [], holeAwards: [], gameResults: [],
} as any
const st = computeTournament(snap, settings.data)
console.log(JSON.stringify(st.flags, null, 1))
