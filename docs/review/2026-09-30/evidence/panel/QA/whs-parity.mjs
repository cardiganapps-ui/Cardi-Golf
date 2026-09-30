import fs from 'node:fs'
const c = JSON.parse(fs.readFileSync('/home/user/Cardi-Golf/src/engine/profile/cases/whs.json', 'utf8'))
const q = (s) => `'${String(s).replace(/'/g, "''")}'`
const rows = []
for (const x of c.diff) rows.push([`diff ${x.ags}/${x.rating10}/${x.slope}`, `public.whs_diff10(${x.ags}, ${x.rating10}, ${x.slope})`, x.expect10])
for (const x of c.courseHcp) rows.push([`courseHcp ${x.index10}/${x.slope}/${x.rating10}/${x.par}`, `public.whs_course_hcp(${x.index10}, ${x.slope}, ${x.rating10}, ${x.par})`, x.expect])
for (const x of c.strokes) rows.push([`strokes ch${x.ch} si${x.si}`, `public.whs_strokes(${x.ch}, ${x.si})`, x.expect])
for (const x of c.index) rows.push([`index ${JSON.stringify(x.diffs10).slice(0, 30)}`, `public.whs_index10(array[${x.diffs10.join(',')}]::int[])`, x.expect10 ?? null])
const sel = rows.map(([name, expr, want]) => `select ${q(name)} as name, (${expr})::text as got, ${want == null ? 'null' : q(want)}::text as want`).join('\nunion all\n')
console.log(`select count(*) as cases, count(*) filter (where got is distinct from want) as mismatches, coalesce(string_agg(case when got is distinct from want then name || ' got ' || coalesce(got, 'null') || ' want ' || coalesce(want, 'null') end, '; '), '') as detail from (\n${sel}\n) t;`)
