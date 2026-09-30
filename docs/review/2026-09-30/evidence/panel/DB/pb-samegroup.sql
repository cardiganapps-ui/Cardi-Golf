-- Two phones of the SAME group (group 1) saving the same four players' holes at the same time.
\set p random(1, 4)
\set h random(10, 12)
\set st random(3, 7)
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', md5('pb1')::uuid, 'role', 'authenticated', 'is_anonymous', true)::text, true);
SET LOCAL statement_timeout = '8s';
INSERT INTO public.scores (round_id, player_id, hole, strokes, putts, picked_up, entered_by, client_ts)
VALUES (md5('r2:t60')::uuid, md5('p:t60:' || :p)::uuid, :h, :st, 2, false, md5('p:t60:' || (1 + :client_id))::uuid, now())
ON CONFLICT (round_id, player_id, hole) DO UPDATE SET strokes = excluded.strokes, putts = excluded.putts, picked_up = excluded.picked_up, entered_by = excluded.entered_by, client_ts = excluded.client_ts;
COMMIT;
