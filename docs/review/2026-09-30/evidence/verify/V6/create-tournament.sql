\set ON_ERROR_STOP 1
-- V6: create a tournament exactly as the wizard does (settings.rounds = 2) and count what exists afterwards.
insert into auth.users (id, email, email_confirmed_at, is_anonymous, raw_user_meta_data)
values ('66666666-6666-4666-8666-000000000006', 'v6-organizer@polo.test', now(), false, '{"display_name":"V6 Org"}')
on conflict (id) do nothing;
begin;
select set_config('request.jwt.claims', '{"sub":"66666666-6666-4666-8666-000000000006","role":"authenticated","aud":"authenticated","email":"v6-organizer@polo.test","is_anonymous":false,"user_metadata":{"display_name":"V6 Org"}}', true);
set local role authenticated;
create temp table if not exists v6_t as select * from public.create_tournament('Copa Verificación V6', '{"modules":{"individual":{"enabled":true,"label":"Individual","format":"stableford","formatOptions":{"scoring":"net","matchMode":"singles","teamMode":"bestBall","teamScoring":"strokes"}},"bestRound":{"enabled":false,"label":"Mejor ronda"},"pairs":{"enabled":false,"label":"Parejas","pairing":[],"honoreePicks":false},"snake":{"enabled":false,"label":"La Víbora","puttsThreshold":3},"fewestPutts":{"enabled":false,"label":"Menos putts"},"auction":{"enabled":false,"label":"La Calcutta"}},"tiers":[],"rounds":2,"groupSize":4,"labels":{"lastPlace":"Último lugar","honoree":"Homenajeado"},"entryFee":0,"houseCut":0,"handicap":{"allowance":1,"cap":54,"rounding":"halfUp","perRoundSlope":false,"estimateWeights":[0.45,0.4,0.15]},"day2Cut":{"threshold":36,"pointsPerStroke":2,"maxStrokes":0,"mode":"previous"},"prizes":{"stableford":[],"stablefordMode":"amount","pairs":[],"bestRoundPerDay":0,"snakePerSurvivor":0,"fewestPutts":0},"auction":{"openingBid":250,"increment":250,"maxPlayersPerOwner":3,"selfOwnedCountsTowardMax":true,"guestsCanBid":false,"buybackMaxPct":50,"payout":[{"slot":"place","place":1,"share":0.7},{"slot":"place","place":2,"share":0.25},{"slot":"lastPlace","share":0.05}]},"games":[],"pickupPuttsForFewestPutts":3,"tieFallback":"split","spectatorLink":false,"timezone":"America/Mexico_City","currency":"MXN","expectedPlayers":8}'::jsonb, null, null);
select id, slug, status, (settings->>'rounds')::int as settings_rounds, (settings->>'expectedPlayers')::int as expected_players, current_round_id from v6_t;
reset role;
select 'rounds' as what, count(*) from public.rounds where tournament_id = (select id from v6_t)
union all select 'players', count(*) from public.players where tournament_id = (select id from v6_t)
union all select 'groups', count(*) from public.groups g join public.rounds r on r.id = g.round_id where r.tournament_id = (select id from v6_t)
union all select 'tournament_organizers', count(*) from public.tournament_organizers where tournament_id = (select id from v6_t)
union all select 'courses_total_in_db', count(*) from public.courses;
commit;
