-- Cardi-Golf · 0003 · Row Level Security (CLAUDE.md §7 "Permissions")
-- Read: any member of the tournament reads everything in it (pin hashes live
-- in player_pins, which has no policy at all). Write: organizers/admins, plus
-- the scoring rules for players in the same group.

alter table public.organizers enable row level security;
alter table public.courses enable row level security;
alter table public.tees enable row level security;
alter table public.holes enable row level security;
alter table public.course_documents enable row level security;
alter table public.tournaments enable row level security;
alter table public.tournament_organizers enable row level security;
alter table public.players enable row level security;
alter table public.player_pins enable row level security;
alter table public.device_sessions enable row level security;
alter table public.pairs enable row level security;
alter table public.rounds enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.round_tees enable row level security;
alter table public.scores enable row level security;
alter table public.snake_tiebreaks enable row level security;
alter table public.card_signatures enable row level security;
alter table public.handicap_overrides enable row level security;
alter table public.calcutta_lots enable row level security;
alter table public.calcutta_bids enable row level security;
alter table public.calcutta_buybacks enable row level security;
alter table public.payments enable row level security;
alter table public.audit_log enable row level security;
alter table public.photos enable row level security;

-- organizers: you see yourself.
create policy organizers_self on public.organizers for all
  using (auth_user_id = auth.uid()) with check (auth_user_id = auth.uid());

-- courses: any signed-in user reads (they are shared reference data);
-- non-anonymous users create; creator or an organizer using it edits.
create policy courses_read on public.courses for select using (auth.uid() is not null);
create policy courses_insert on public.courses for insert
  with check (auth.uid() is not null and not coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false));
create policy courses_update on public.courses for update using (public.can_edit_course(id));
create policy courses_delete on public.courses for delete using (created_by = auth.uid());

create policy tees_read on public.tees for select using (auth.uid() is not null);
create policy tees_write on public.tees for all using (public.can_edit_course(course_id)) with check (public.can_edit_course(course_id));

create policy holes_read on public.holes for select using (auth.uid() is not null);
create policy holes_write on public.holes for all
  using (public.can_edit_course((select course_id from public.tees where id = tee_id)))
  with check (public.can_edit_course((select course_id from public.tees where id = tee_id)));

create policy course_documents_read on public.course_documents for select using (auth.uid() is not null);
create policy course_documents_write on public.course_documents for all
  using (public.can_edit_course(course_id)) with check (public.can_edit_course(course_id));

-- tournaments: members read; organizers update; creation goes through create_tournament().
create policy tournaments_read on public.tournaments for select using (public.is_tournament_member(id));
create policy tournaments_update on public.tournaments for update
  using (public.is_tournament_organizer(id)) with check (public.is_tournament_organizer(id));
create policy tournaments_delete on public.tournaments for delete
  using (exists (select 1 from public.tournament_organizers o where o.tournament_id = id and o.auth_user_id = auth.uid() and o.role = 'owner'));

create policy tournament_organizers_read on public.tournament_organizers for select
  using (public.is_tournament_member(tournament_id));
create policy tournament_organizers_write on public.tournament_organizers for all
  using (public.is_tournament_organizer(tournament_id)) with check (public.is_tournament_organizer(tournament_id));

-- players: members read; organizers write.
create policy players_read on public.players for select using (public.is_tournament_member(tournament_id));
create policy players_write on public.players for all
  using (public.is_tournament_organizer(tournament_id)) with check (public.is_tournament_organizer(tournament_id));

-- player_pins: no policy → nobody but security-definer functions.

-- device_sessions: you see your own link.
create policy device_sessions_self on public.device_sessions for select using (auth_user_id = auth.uid());

create policy pairs_read on public.pairs for select using (public.is_tournament_member(tournament_id));
create policy pairs_write on public.pairs for all
  using (public.is_tournament_organizer(tournament_id)) with check (public.is_tournament_organizer(tournament_id));

create policy rounds_read on public.rounds for select using (public.is_tournament_member(tournament_id));
create policy rounds_write on public.rounds for all
  using (public.is_tournament_organizer(tournament_id)) with check (public.is_tournament_organizer(tournament_id));

create policy groups_read on public.groups for select using (public.is_tournament_member(public.round_tournament_id(round_id)));
create policy groups_write on public.groups for all
  using (public.is_tournament_organizer(public.round_tournament_id(round_id)))
  with check (public.is_tournament_organizer(public.round_tournament_id(round_id)));

create policy group_members_read on public.group_members for select using (public.is_tournament_member(public.group_tournament_id(group_id)));
create policy group_members_write on public.group_members for all
  using (public.is_tournament_organizer(public.group_tournament_id(group_id)))
  with check (public.is_tournament_organizer(public.group_tournament_id(group_id)));

create policy round_tees_read on public.round_tees for select using (public.is_tournament_member(public.round_tournament_id(round_id)));
create policy round_tees_write on public.round_tees for all
  using (public.is_tournament_organizer(public.round_tournament_id(round_id)))
  with check (public.is_tournament_organizer(public.round_tournament_id(round_id)));

-- scores: members read. Write when (a) organizer/admin, or (b) same group,
-- round live, card not signed. (Signed-card edits by admins need a reason:
-- the app writes it into the audit log through an override note.)
create policy scores_read on public.scores for select using (public.is_tournament_member(public.round_tournament_id(round_id)));
create policy scores_write on public.scores for all
  using (
    public.is_tournament_organizer(public.round_tournament_id(round_id))
    or (public.shares_group(round_id, player_id) and public.round_is_live(round_id) and not public.card_is_signed(round_id, player_id))
  )
  with check (
    public.is_tournament_organizer(public.round_tournament_id(round_id))
    or (public.shares_group(round_id, player_id) and public.round_is_live(round_id) and not public.card_is_signed(round_id, player_id))
  );

create policy snake_tiebreaks_read on public.snake_tiebreaks for select using (public.is_tournament_member(public.round_tournament_id(round_id)));
create policy snake_tiebreaks_write on public.snake_tiebreaks for all
  using (
    public.is_tournament_organizer(public.round_tournament_id(round_id))
    or exists (select 1 from public.group_members m where m.group_id = snake_tiebreaks.group_id and m.player_id = public.current_player_id())
  )
  with check (
    public.is_tournament_organizer(public.round_tournament_id(round_id))
    or exists (select 1 from public.group_members m where m.group_id = snake_tiebreaks.group_id and m.player_id = public.current_player_id())
  );

-- card signatures: a member of the group signs (the other pair's card); organizers can remove.
create policy card_signatures_read on public.card_signatures for select using (public.is_tournament_member(public.round_tournament_id(round_id)));
create policy card_signatures_insert on public.card_signatures for insert
  with check (
    public.is_tournament_organizer(public.round_tournament_id(round_id))
    or exists (
      select 1 from public.pairs p
      where p.id = pair_id and public.shares_group(round_id, p.player1_id)
    )
  );
create policy card_signatures_delete on public.card_signatures for delete
  using (public.is_tournament_organizer(public.round_tournament_id(round_id)));

create policy handicap_overrides_read on public.handicap_overrides for select using (public.is_tournament_member(public.round_tournament_id(round_id)));
create policy handicap_overrides_write on public.handicap_overrides for all
  using (public.is_tournament_organizer(public.round_tournament_id(round_id)))
  with check (public.is_tournament_organizer(public.round_tournament_id(round_id)));

create policy calcutta_lots_read on public.calcutta_lots for select using (public.is_tournament_member(tournament_id));
create policy calcutta_lots_write on public.calcutta_lots for all
  using (public.is_tournament_organizer(tournament_id)) with check (public.is_tournament_organizer(tournament_id));

create policy calcutta_bids_read on public.calcutta_bids for select using (public.is_tournament_member(public.lot_tournament_id(lot_id)));
create policy calcutta_bids_write on public.calcutta_bids for all
  using (public.is_tournament_organizer(public.lot_tournament_id(lot_id)))
  with check (public.is_tournament_organizer(public.lot_tournament_id(lot_id)));

create policy calcutta_buybacks_read on public.calcutta_buybacks for select using (public.is_tournament_member(public.lot_tournament_id(lot_id)));
create policy calcutta_buybacks_write on public.calcutta_buybacks for all
  using (public.is_tournament_organizer(public.lot_tournament_id(lot_id)))
  with check (public.is_tournament_organizer(public.lot_tournament_id(lot_id)));

create policy payments_read on public.payments for select using (public.is_tournament_member(tournament_id));
create policy payments_write on public.payments for all
  using (public.is_tournament_organizer(tournament_id)) with check (public.is_tournament_organizer(tournament_id));

create policy audit_log_read on public.audit_log for select using (public.is_tournament_organizer(tournament_id));

create policy photos_read on public.photos for select using (public.is_tournament_member(public.round_tournament_id(round_id)));
create policy photos_write on public.photos for all
  using (public.is_tournament_member(public.round_tournament_id(round_id)))
  with check (public.is_tournament_member(public.round_tournament_id(round_id)));

-- ---------------------------------------------------------------------------
-- Realtime: publish the tables the clients subscribe to (§8).
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table
  public.tournaments, public.players, public.pairs, public.rounds, public.groups, public.group_members,
  public.round_tees, public.scores, public.snake_tiebreaks, public.card_signatures, public.handicap_overrides,
  public.calcutta_lots, public.calcutta_bids, public.calcutta_buybacks, public.payments;

-- ---------------------------------------------------------------------------
-- Storage: one public bucket for logos, avatars and scorecard photos.
-- Paths: <tournament_id>/... for tournament assets, courses/<course_id>/... for scorecards.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tournament-assets', 'tournament-assets', true, 10485760, array['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'application/pdf'])
on conflict (id) do nothing;

create policy assets_public_read on storage.objects for select using (bucket_id = 'tournament-assets');
create policy assets_member_write on storage.objects for insert
  with check (
    bucket_id = 'tournament-assets' and auth.uid() is not null and (
      (split_part(name, '/', 1) = 'courses' and not coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false))
      or public.is_tournament_member(nullif(split_part(name, '/', 1), '')::uuid)
    )
  );
create policy assets_organizer_update on storage.objects for update
  using (bucket_id = 'tournament-assets' and (split_part(name, '/', 1) = 'courses' or public.is_tournament_organizer(nullif(split_part(name, '/', 1), '')::uuid)));
create policy assets_organizer_delete on storage.objects for delete
  using (bucket_id = 'tournament-assets' and (split_part(name, '/', 1) = 'courses' or public.is_tournament_organizer(nullif(split_part(name, '/', 1), '')::uuid)));
