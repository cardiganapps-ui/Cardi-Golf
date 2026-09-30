// V6: the exact settings the wizard sends for "blank" + 2 rounds (what NewTournamentScreen.create() passes).
import { PRESETS } from '/home/user/Cardi-Golf/src/engine/games/presets'
import { safeParseSettings } from '/home/user/Cardi-Golf/src/engine/settings/schema'
const blank = PRESETS.find((p) => p.id === 'blank')!
const s = blank.build()
s.rounds = 2
const parsed = safeParseSettings(s)
if (!parsed.success) throw new Error('invalid')
const out = { ...parsed.data, timezone: 'America/Mexico_City', expectedPlayers: blank.players }
process.stdout.write(JSON.stringify(out))
