-- DB-03, DB-04: a Comité ruling on a hole contest is told apart from a
-- group's claim, and lives beside the claims it overrides.
--
-- Until now a ruling was a hole_awards row with no group, under the primary
-- key (round_id, game_id, hole, player_id):
--   * DB-04: the Comité could not rule a disputed hole for a player a group
--     had claimed. The ruling's row collided with the claim (23505), and the
--     only way through was «Nadie» first, which deletes every claim.
--   * DB-03: deleting a group (Comité › Grupos) set its claims' group to null
--     (on delete set null), which made each of them a ruling for the whole
--     field that overrode every other group's claim: a disputed hole became a
--     win nobody decided.
--
-- Now:
--   * `source` says whose row it is: 'comite' with no group, 'group' with one.
--     It is generated from group_id, so every writer (an older bundle, the
--     outbox, the Comité's screen, restore_tournament) writes as before, and
--     nobody can write one that disagrees with its group.
--   * The primary key takes it: a player's ruling and the same player's claim
--     are two rows.
--   * A group's claims go with the group (on delete cascade): a claim never
--     becomes a ruling. A group deleted while its hole is disputed takes its
--     side of the dispute with it; the claims of the groups that remain stand.
--   * Realtime's delete events carry the key, so they carry `source` too.
--
-- The engine already read a row with no group as the Comité's
-- (src/engine/games/contest/index.ts): nothing it computes changes for the
-- rows that exist. Safe to run again.

alter table public.hole_awards
  add column if not exists source text generated always as (case when group_id is null then 'comite' else 'group' end) stored;

alter table public.hole_awards drop constraint if exists hole_awards_pkey;
alter table public.hole_awards add constraint hole_awards_pkey primary key (round_id, game_id, hole, player_id, source);

alter table public.hole_awards drop constraint if exists hole_awards_group_id_fkey;
alter table public.hole_awards add constraint hole_awards_group_id_fkey foreign key (group_id) references public.groups (id) on delete cascade;

comment on column public.hole_awards.source is
  'Whose row: comite (no group: the Comité''s ruling, which overrides the groups'' claims on its hole) or group (that group''s claim). Generated from group_id (0042).';
