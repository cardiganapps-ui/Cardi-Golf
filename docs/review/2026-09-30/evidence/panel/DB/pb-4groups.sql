-- One phone per group (client_id 0..3 → groups 1..4 of the 60-player tournament's live round 2): a score upsert.
\set g :client_id + 1
\set p (:g - 1) * 4 + random(1, 4)
\set h random(10, 18)
\set st random(3, 7)
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', md5('pb' || :g)::uuid, 'role', 'authenticated', 'is_anonymous', true)::text, true);
SET LOCAL statement_timeout = '8s';
INSERT INTO public.scores (round_id, player_id, hole, strokes, putts, picked_up, entered_by, client_ts)
VALUES (md5('r2:t60')::uuid, md5('p:t60:' || :p)::uuid, :h, :st, 2, false, md5('p:t60:' || ((:g - 1) * 4 + 1))::uuid, now())
ON CONFLICT (round_id, player_id, hole) DO UPDATE SET strokes = excluded.strokes, putts = excluded.putts, picked_up = excluded.picked_up, entered_by = excluded.entered_by, client_ts = excluded.client_ts;
COMMIT;
