begin; set local session_replication_role = replica;
\set rows `cat /tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad/verify/evidence/V4/dr-dump/tournaments.json`
insert into public.tournaments overriding system value select * from jsonb_populate_recordset(null::public.tournaments, :'rows'::jsonb);
\set rows `cat /tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad/verify/evidence/V4/dr-dump/tournament_organizers.json`
insert into public.tournament_organizers overriding system value select * from jsonb_populate_recordset(null::public.tournament_organizers, :'rows'::jsonb);
\set rows `cat /tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad/verify/evidence/V4/dr-dump/organizers.json`
insert into public.organizers overriding system value select * from jsonb_populate_recordset(null::public.organizers, :'rows'::jsonb);
\set rows `cat /tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad/verify/evidence/V4/dr-dump/players.json`
insert into public.players overriding system value select * from jsonb_populate_recordset(null::public.players, :'rows'::jsonb);
\set rows `cat /tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad/verify/evidence/V4/dr-dump/player_pins.json`
insert into public.player_pins overriding system value select * from jsonb_populate_recordset(null::public.player_pins, :'rows'::jsonb);
\set rows `cat /tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad/verify/evidence/V4/dr-dump/pin_attempts.json`
insert into public.pin_attempts overriding system value select * from jsonb_populate_recordset(null::public.pin_attempts, :'rows'::jsonb);
\set rows `cat /tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad/verify/evidence/V4/dr-dump/device_sessions.json`
insert into public.device_sessions overriding system value select * from jsonb_populate_recordset(null::public.device_sessions, :'rows'::jsonb);
\set rows `cat /tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad/verify/evidence/V4/dr-dump/rounds.json`
insert into public.rounds overriding system value select * from jsonb_populate_recordset(null::public.rounds, :'rows'::jsonb);
\set rows `cat /tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad/verify/evidence/V4/dr-dump/groups.json`
insert into public.groups overriding system value select * from jsonb_populate_recordset(null::public.groups, :'rows'::jsonb);
\set rows `cat /tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad/verify/evidence/V4/dr-dump/group_members.json`
insert into public.group_members overriding system value select * from jsonb_populate_recordset(null::public.group_members, :'rows'::jsonb);
\set rows `cat /tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad/verify/evidence/V4/dr-dump/scores.json`
insert into public.scores overriding system value select * from jsonb_populate_recordset(null::public.scores, :'rows'::jsonb);
\set rows `cat /tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad/verify/evidence/V4/dr-dump/game_entries.json`
insert into public.game_entries overriding system value select * from jsonb_populate_recordset(null::public.game_entries, :'rows'::jsonb);
\set rows `cat /tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad/verify/evidence/V4/dr-dump/hole_awards.json`
insert into public.hole_awards overriding system value select * from jsonb_populate_recordset(null::public.hole_awards, :'rows'::jsonb);
\set rows `cat /tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad/verify/evidence/V4/dr-dump/game_results.json`
insert into public.game_results overriding system value select * from jsonb_populate_recordset(null::public.game_results, :'rows'::jsonb);
\set rows `cat /tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad/verify/evidence/V4/dr-dump/audit_log.json`
insert into public.audit_log overriding system value select * from jsonb_populate_recordset(null::public.audit_log, :'rows'::jsonb);
\set rows `cat /tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad/verify/evidence/V4/dr-dump/platform_admins.json`
insert into public.platform_admins overriding system value select * from jsonb_populate_recordset(null::public.platform_admins, :'rows'::jsonb);
commit;
