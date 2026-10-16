-- The metric that rules, and the organizer's funnel, on Resumen (STRAT-12).
--
-- docs/strategy/README.md names one number: tournaments closed to the peso.
-- Resumen showed counts (accounts, tournaments, crews) that say nothing about
-- whether Polo ran someone's tournament. platform_funnel reads, over the
-- tournaments created in the last p_days by organizers who are not the
-- platform admin, outside practice (counts_for_stats) and Ronda rápida:
--   - each step a tournament reaches: created, a field (2+ players), a day in
--     play, a hole saved, a card signed, Terminado;
--   - how many organizers reached each step;
--   - the north star: Terminado with 8+ players and holes saved from 3+
--     sessions (an iPhone's Safari and its home-screen app are two sessions,
--     so this counts phones generously). Terminado already means nothing is
--     por asignar, unless the tournament was closed by a build or a write that
--     skipped the phone's gate (0029 checks only what SQL decides).
-- Read only; the platform admin only (42501), like every platform_* function.

create or replace function public.platform_funnel(p_days int default 90)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  n int := least(greatest(coalesce(p_days, 90), 7), 365);
begin
  if not public.is_platform_admin() then raise exception 'Solo el admin de Polo' using errcode = '42501'; end if;
  return (
    with t as (
      select tt.id, tt.created_by, tt.status
      from public.tournaments tt
      where not tt.quick
        and tt.counts_for_stats
        and tt.created_at > now() - make_interval(days => n)
        and not exists (select 1 from public.platform_admins a where a.auth_user_id = tt.created_by)
    ),
    facts as (
      select t.id, t.created_by, t.status,
        (select count(*) from public.players p where p.tournament_id = t.id) as players,
        exists (select 1 from public.rounds r where r.tournament_id = t.id and r.status in ('live', 'finished')) as played,
        exists (select 1 from public.scores s where s.tournament_id = t.id) as scored,
        exists (select 1 from public.card_signatures c where c.tournament_id = t.id) as signed,
        (select count(distinct l.actor_auth_user_id) from public.audit_log l
          where l.tournament_id = t.id and l.table_name = 'scores' and l.actor_auth_user_id is not null) as phones
      from t
    ),
    reached as (
      select f.created_by, v.ord, v.key
      from facts f
      cross join (values (1, 'created'), (2, 'field'), (3, 'played'), (4, 'scored'), (5, 'signed'), (6, 'finished')) v(ord, key)
      where case v.key
        when 'created' then true
        when 'field' then f.players >= 2
        when 'played' then f.played
        when 'scored' then f.scored
        when 'signed' then f.signed
        else f.status = 'finished'
      end
    )
    select jsonb_build_object(
      'days', n,
      'northStar', (select count(*) from facts f where f.status = 'finished' and f.players >= 8 and f.phones >= 3),
      'finished', (select count(*) from facts f where f.status = 'finished'),
      'organizers', (select count(distinct f.created_by) from facts f),
      'steps', (
        select coalesce(jsonb_agg(jsonb_build_object('key', k.key, 'tournaments', k.tournaments, 'organizers', k.organizers) order by k.ord), '[]'::jsonb)
        from (
          select v.ord, v.key,
            (select count(*) from reached r where r.key = v.key) as tournaments,
            (select count(distinct r.created_by) from reached r where r.key = v.key) as organizers
          from (values (1, 'created'), (2, 'field'), (3, 'played'), (4, 'scored'), (5, 'signed'), (6, 'finished')) v(ord, key)
        ) k
      )
    )
  );
end;
$$;
revoke execute on function public.platform_funnel(int) from public, anon;
grant execute on function public.platform_funnel(int) to authenticated, service_role;
