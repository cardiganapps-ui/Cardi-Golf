-- Cardi-Golf · 0001 · schema (CLAUDE.md §7, §13b)
-- Tenant boundary is the tournament. Every table hangs off `tournaments`
-- directly or through rounds/players. Raw facts only; the engine derives
-- everything else.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Organizers, courses
-- ---------------------------------------------------------------------------
create table public.organizers (
  auth_user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  location text,
  source text not null default 'manual' check (source in ('manual', 'golfcourseapi', 'scorecard_photo')),
  external_id text,
  imported_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.tees (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  name text not null,
  color text,
  rating numeric(4, 1),
  slope integer check (slope between 55 and 155),
  par_total integer,
  gender text,
  sort_order integer not null default 0
);
create index tees_course_idx on public.tees (course_id);

create table public.holes (
  tee_id uuid not null references public.tees (id) on delete cascade,
  number integer not null check (number between 1 and 18),
  par integer not null check (par between 3 and 6),
  stroke_index integer not null check (stroke_index between 1 and 18),
  yards integer,
  primary key (tee_id, number)
);

create table public.course_documents (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  kind text not null default 'scorecard',
  url text not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Tournaments
-- ---------------------------------------------------------------------------
create table public.tournaments (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]([a-z0-9-]{1,38}[a-z0-9])?$'),
  name text not null,
  tagline text,
  logo_url text,
  accent_color text,
  join_code text not null unique check (join_code ~ '^[A-Z2-9]{6}$'),
  status text not null default 'setup' check (status in ('setup', 'auction', 'live', 'finished')),
  current_round_id uuid,
  settings jsonb not null default '{}'::jsonb,
  banker_player_id uuid,
  timezone text not null default 'America/Mazatlan',
  currency text not null default 'MXN',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.tournament_organizers (
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  auth_user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'admin' check (role in ('owner', 'admin')),
  primary key (tournament_id, auth_user_id)
);

-- ---------------------------------------------------------------------------
-- People and teams
-- ---------------------------------------------------------------------------
create table public.players (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  full_name text not null,
  display_name text not null,
  tier text,
  base_hcp numeric(4, 1) not null default 18,
  handicap_source text not null default 'manual' check (handicap_source in ('index', 'estimate', 'manual')),
  handicap_index numeric(4, 1),
  estimate_inputs jsonb,
  default_tee_id uuid references public.tees (id) on delete set null,
  is_honoree boolean not null default false,
  is_admin boolean not null default false,
  avatar_url text,
  form_guide text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index players_tournament_idx on public.players (tournament_id);

-- PINs live apart from players so no policy can ever expose a hash.
-- No RLS policy is defined on purpose: only security-definer functions touch it.
create table public.player_pins (
  player_id uuid primary key references public.players (id) on delete cascade,
  pin_hash text not null,
  failed_attempts integer not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

create table public.device_sessions (
  auth_user_id uuid primary key references auth.users (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index device_sessions_player_idx on public.device_sessions (player_id);

create table public.pairs (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  name text,
  player1_id uuid not null references public.players (id) on delete cascade,
  player2_id uuid not null references public.players (id) on delete cascade,
  kind text,
  picked_by_honoree boolean not null default false,
  drawn_at timestamptz,
  check (player1_id <> player2_id)
);
create index pairs_tournament_idx on public.pairs (tournament_id);

-- ---------------------------------------------------------------------------
-- Rounds and scoring
-- ---------------------------------------------------------------------------
create table public.rounds (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  number integer not null check (number >= 1),
  date date,
  course_id uuid references public.courses (id) on delete set null,
  holes integer not null default 18 check (holes in (9, 18)),
  status text not null default 'scheduled' check (status in ('scheduled', 'live', 'finished', 'cancelled')),
  unique (tournament_id, number)
);

alter table public.tournaments
  add constraint tournaments_current_round_fk foreign key (current_round_id) references public.rounds (id) on delete set null,
  add constraint tournaments_banker_fk foreign key (banker_player_id) references public.players (id) on delete set null;

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.rounds (id) on delete cascade,
  number integer not null check (number >= 1),
  tee_time time,
  start_hole integer not null default 1 check (start_hole between 1 and 18),
  unique (round_id, number)
);

create table public.group_members (
  group_id uuid not null references public.groups (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  primary key (group_id, player_id)
);
create index group_members_player_idx on public.group_members (player_id);

create table public.round_tees (
  round_id uuid not null references public.rounds (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  tee_id uuid not null references public.tees (id) on delete cascade,
  primary key (round_id, player_id)
);

create table public.scores (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.rounds (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  hole integer not null check (hole between 1 and 18),
  strokes integer check (strokes between 1 and 15),
  putts integer check (putts between 0 and 15),
  picked_up boolean not null default false,
  entered_by uuid references public.players (id) on delete set null,
  client_ts timestamptz,
  updated_at timestamptz not null default now(),
  unique (round_id, player_id, hole),
  check (picked_up or strokes is not null),
  check (putts is null or strokes is null or putts <= strokes)
);
create index scores_round_idx on public.scores (round_id);

create table public.snake_tiebreaks (
  round_id uuid not null references public.rounds (id) on delete cascade,
  group_id uuid not null references public.groups (id) on delete cascade,
  hole integer not null check (hole between 1 and 18),
  last_holed_player_id uuid not null references public.players (id) on delete cascade,
  decided_by uuid references public.players (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (round_id, group_id, hole)
);

create table public.card_signatures (
  round_id uuid not null references public.rounds (id) on delete cascade,
  pair_id uuid not null references public.pairs (id) on delete cascade,
  signed_by uuid references public.players (id) on delete set null,
  signed_at timestamptz not null default now(),
  primary key (round_id, pair_id)
);

create table public.handicap_overrides (
  round_id uuid not null references public.rounds (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  playing_hcp integer not null check (playing_hcp between 0 and 60),
  reason text not null check (length(reason) >= 3),
  by uuid references public.players (id) on delete set null,
  at timestamptz not null default now(),
  primary key (round_id, player_id)
);

-- ---------------------------------------------------------------------------
-- Calcutta and money
-- ---------------------------------------------------------------------------
create table public.calcutta_lots (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  lot_number integer not null,
  status text not null default 'pending' check (status in ('pending', 'open', 'sold')),
  price integer check (price >= 0),
  owner_id uuid references public.players (id) on delete set null,
  sold_at timestamptz,
  unique (tournament_id, player_id),
  unique (tournament_id, lot_number)
);

create table public.calcutta_bids (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null references public.calcutta_lots (id) on delete cascade,
  bidder_id uuid not null references public.players (id) on delete cascade,
  amount integer not null check (amount > 0),
  created_at timestamptz not null default now()
);
create index calcutta_bids_lot_idx on public.calcutta_bids (lot_id);

create table public.calcutta_buybacks (
  lot_id uuid primary key references public.calcutta_lots (id) on delete cascade,
  pct integer not null check (pct between 0 and 100),
  amount integer not null check (amount >= 0),
  paid boolean not null default false
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  from_player_id uuid references public.players (id) on delete cascade,
  to_player_id uuid references public.players (id) on delete cascade,
  amount integer not null check (amount >= 0),
  kind text not null check (kind in ('entry', 'calcutta', 'buyback', 'payout', 'other')),
  paid boolean not null default false,
  note text,
  created_at timestamptz not null default now()
);
create index payments_tournament_idx on public.payments (tournament_id);

-- ---------------------------------------------------------------------------
-- Records
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id bigint generated always as identity primary key,
  tournament_id uuid,
  table_name text not null,
  row_id text not null,
  actor_auth_user_id uuid,
  actor_player_id uuid,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  before jsonb,
  after jsonb,
  reason text,
  at timestamptz not null default now()
);
create index audit_log_tournament_idx on public.audit_log (tournament_id, at desc);

create table public.photos (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.rounds (id) on delete cascade,
  player_id uuid references public.players (id) on delete set null,
  hole integer check (hole between 1 and 18),
  url text not null,
  created_at timestamptz not null default now()
);
