create or replace function public.whs_strokes(ch int, si int)
returns int language sql immutable set search_path = public as $$
  select case
    when ch >= 0 then ch / 18 + case when si <= ch % 18 then 1 else 0 end
    else case when si > 18 + ch then -1 else 0 end
  end
$$;

create or replace function public.whs_course_hcp(index10 int, slope int, rating10 int, par int)
returns int language sql immutable set search_path = public as $$
  select floor((2 * (index10 * slope + (rating10 - par * 10) * 113) + 1130)::numeric / 2260)::int
$$;

create or replace function public.whs_diff10(ags int, rating10 int, slope int)
returns int language sql immutable set search_path = public as $$
  select floor((2 * (ags * 10 - rating10) * 113 + slope)::numeric / (2 * slope))::int
$$;

/** Differentials in tenths, newest first; only the latest 20 count. Null under 3. */
create or replace function public.whs_index10(diffs int[])
returns int language plpgsql immutable set search_path = public as $$
declare
  n int;
  k int;
  adj int := 0;
  s int;
begin
  diffs := diffs[1:20];
  n := coalesce(array_length(diffs, 1), 0);
  if n < 3 then
    return null;
  end if;
  k := case when n <= 5 then 1 when n <= 8 then 2 when n <= 11 then 3 when n <= 14 then 4 when n <= 16 then 5 when n <= 18 then 6 when n = 19 then 7 else 8 end;
  adj := case n when 3 then -20 when 4 then -10 when 6 then -10 else 0 end;
  select sum(d) into s from (select d from unnest(diffs) with ordinality u(d, i) order by d, i limit k) x;
  return least(floor((2 * s + k)::numeric / (2 * k))::int + adj, 540);
end;
$$;
