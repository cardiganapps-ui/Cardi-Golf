# Adversarial verification brief (read all of it)

`$S` = `/tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad`.

You are an **independent verifier** on the Polo panel review. A panel of specialists reported findings; you did not write any of them. Your job is to **try to disprove** each P0/P1 finding in your batch file `$S/verify/<BATCH>.input.json` (each entry: the canonical finding plus `also_reported_as` duplicates from other panelists, with their evidence and repro). Only what survives your attack goes into the report as CONFIRMED. Be skeptical, precise and fair: a finding that is real must not be killed on a technicality, and a finding that is overstated must be downgraded.

First read `$S/PANEL_BRIEF.md` (the panel's rules: data safety, shared environment, severity definitions). Everything there binds you, with these updates:
- The container restarted; the shared preview server on :4173 no longer exists and must not be restarted. Start **your own** when you need live pages: `cd /home/user/Cardi-Golf && npx vite preview --outDir $S/dist-design --port <your port> --strictPort --host 127.0.0.1` (run it in the background; stop it when you're done). `$S/dist-design` is HEAD built with fixture routes and the public Supabase env.
- The local Postgres harness is up on 127.0.0.1:5433 (`$S/pg/README.md`; make your own database with `$S/pg/bootstrap.sh <yourdb> --seed`; never touch others' databases).
- Production (https://golf.cardigan.mx) runs HEAD. Live writes: only score entry on Ensayo (`/t/ensayo`, player Nico, PIN from `$ENSAYO_PIN`) and only if essential; never change Ensayo's round status, run its auction/draw, sign cards or restore backups (the reliability panelist owns that). Prefer engine-level repros (a scratch vitest with a config in your scratch dir: `root: '/home/user/Cardi-Golf'`, absolute include, imports by absolute path), the in-memory fixture routes, and the local harness.
- Your scratch dir: `$S/verify/evidence/<BATCH>/`. Never modify files in the repo.
- Known artifact: the fixture routes `/t/_/<fixture>/dinero|juegos|mas` show a ~58 px strip under the tab bar that production doesn't have (`src/app/AppShell.tsx:19`); don't let fixture-only artifacts confirm or kill a finding.

For **each** finding:
1. Read the cited code and evidence yourself. Don't trust the author's summary.
2. Reproduce independently: write your own minimal repro (or, at minimum, read and understand the author's script before running it, then run it). Record exactly what you ran and the key output.
3. Attack it: Is the code path reachable in the real app (not only in a fixture or a test)? Is there a mitigation elsewhere (a guard, a trigger, a later recompute, a UI that prevents the input)? Is it an artifact of the sandbox (proxy, missing secrets, container, headless Chromium without WebKit)? Did the author misread the rules in CLAUDE.md §5/§11/§18? Is the impact overstated?
4. Judge severity with the definitions: **P0** = wrong money, lost or corrupted data, a security hole with real impact, or a core flow that fails on the day; **P1** = must fix before the trip (8 Apr 2027), a clear defect or a gap a top company would never ship; **P2** = meaningful improvement; **P3** = polish. Say whether it bites **the first tournament** (Nacho's: 12 players, 2 rounds of 18, Stableford + side games + Calcutta, vía banco), **the platform** (other tournaments, formats, quick rounds), or both. A defect in a feature the platform ships to users today is not excused by "the first tournament doesn't use it", but say so.
5. Check the status vs the earlier audits (`docs/audit-2026-09-28.md`, and `$S/history/status.md` for the mapped statuses). A regression is one severity higher than its assessed severity.

Write `$S/verify/<BATCH>.result.json` **as you go** (after each finding): a JSON array of
```json
{
  "canonical_id": "MONEY-01",
  "verdict": "CONFIRMED | PLAUSIBLE | REFUTED",
  "severity_recommended": "P0 | P1 | P2 | P3",
  "severity_reasoning": "why, against the definitions",
  "scope": "first tournament | platform | both",
  "reproduction": "what you ran and what you saw (commands + key output), your own evidence paths",
  "counter_evidence": "anything that weakens or contradicts the finding (or 'none found')",
  "status_vs_previous": "new | still open (…) | partly fixed (…) | regressed (…)",
  "corrections": "facts in the finding that are wrong or overstated, and the corrected statement (or 'none')"
}
```
CONFIRMED = you reproduced it yourself. PLAUSIBLE = you could not reproduce it here (say exactly why and what would confirm it) but the evidence holds up. REFUTED = the evidence does not support it (explain).

Your final message (≤250 words): one line per finding — `id — verdict — severity — one-line reason`.
