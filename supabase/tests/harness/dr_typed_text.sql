-- Restore drill (scripts/db-test.sh step 3d): text anyone can type, made to
-- break a SQL file (dollar-quote tags, quotes, a comma, a backslash), and a
-- photo on the old project's Storage, on the first player of the copy.
update public.players
set display_name = 'x$check$y $fk$ $$ "q", z'' \n',
    avatar_url = 'https://gmohwledjejlhcwqjnhd.supabase.co/storage/v1/object/public/tournament-assets/p/foto.png'
where id = (select id from public.players order by id limit 1);
