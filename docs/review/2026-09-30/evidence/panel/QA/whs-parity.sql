select count(*) as cases, count(*) filter (where got is distinct from want) as mismatches, coalesce(string_agg(case when got is distinct from want then name || ' got ' || coalesce(got, 'null') || ' want ' || coalesce(want, 'null') end, '; '), '') as detail from (
select 'diff 85/713/131' as name, (public.whs_diff10(85, 713, 131))::text as got, '118'::text as want
union all
select 'diff 78/715/130' as name, (public.whs_diff10(78, 715, 130))::text as got, '57'::text as want
union all
select 'diff 65/715/130' as name, (public.whs_diff10(65, 715, 130))::text as got, '-56'::text as want
union all
select 'diff 72/720/113' as name, (public.whs_diff10(72, 720, 113))::text as got, '0'::text as want
union all
select 'diff 93/670/113' as name, (public.whs_diff10(93, 670, 113))::text as got, '260'::text as want
union all
select 'diff 100/700/113' as name, (public.whs_diff10(100, 700, 113))::text as got, '300'::text as want
union all
select 'courseHcp 81/128/712/72' as name, (public.whs_course_hcp(81, 128, 712, 72))::text as got, '8'::text as want
union all
select 'courseHcp 200/113/720/72' as name, (public.whs_course_hcp(200, 113, 720, 72))::text as got, '20'::text as want
union all
select 'courseHcp -12/113/720/72' as name, (public.whs_course_hcp(-12, 113, 720, 72))::text as got, '-1'::text as want
union all
select 'courseHcp 5/113/720/72' as name, (public.whs_course_hcp(5, 113, 720, 72))::text as got, '1'::text as want
union all
select 'strokes ch0 si1' as name, (public.whs_strokes(0, 1))::text as got, '0'::text as want
union all
select 'strokes ch16 si16' as name, (public.whs_strokes(16, 16))::text as got, '1'::text as want
union all
select 'strokes ch16 si17' as name, (public.whs_strokes(16, 17))::text as got, '0'::text as want
union all
select 'strokes ch18 si18' as name, (public.whs_strokes(18, 18))::text as got, '1'::text as want
union all
select 'strokes ch43 si7' as name, (public.whs_strokes(43, 7))::text as got, '3'::text as want
union all
select 'strokes ch43 si8' as name, (public.whs_strokes(43, 8))::text as got, '2'::text as want
union all
select 'strokes ch-1 si18' as name, (public.whs_strokes(-1, 18))::text as got, '-1'::text as want
union all
select 'strokes ch-1 si17' as name, (public.whs_strokes(-1, 17))::text as got, '0'::text as want
union all
select 'strokes ch-2 si17' as name, (public.whs_strokes(-2, 17))::text as got, '-1'::text as want
union all
select 'index [152,104,120]' as name, (public.whs_index10(array[152,104,120]::int[]))::text as got, '84'::text as want
union all
select 'index [100,90,80,120,110,130]' as name, (public.whs_index10(array[100,90,80,120,110,130]::int[]))::text as got, '75'::text as want
union all
select 'index [81,82,200,200,200,200,200]' as name, (public.whs_index10(array[81,82,200,200,200,200,200]::int[]))::text as got, '82'::text as want
union all
select 'index [100,90]' as name, (public.whs_index10(array[100,90]::int[]))::text as got, null::text as want
union all
select 'index [100,110,120,130,140,150,160,1' as name, (public.whs_index10(array[100,110,120,130,140,150,160,170,180,190,200,210,220,230,240,250,260,270,280,290,0]::int[]))::text as got, '135'::text as want
union all
select 'index [600,600,600,600,600,600,600,6' as name, (public.whs_index10(array[600,600,600,600,600,600,600,600,600,600,600,600,600,600,600,600,600,600,600,600]::int[]))::text as got, '540'::text as want
) t;
