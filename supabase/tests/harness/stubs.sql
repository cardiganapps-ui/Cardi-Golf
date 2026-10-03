-- ===========================================================================
-- Polo review harness: Supabase-compatible stubs for Postgres 16.
-- Applied, as postgres, to polo_template BEFORE supabase/migrations/*.sql.
--
-- Modelled on what a hosted Supabase project provides (supabase/postgres
-- init scripts, GoTrue and storage-api migrations), limited to what Polo's
-- migrations and RLS reference. Differences from real Supabase are listed in
-- README.md ("Known differences").
-- ===========================================================================
\set ON_ERROR_STOP 1

-- ---------------------------------------------------------------------------
-- 1. Roles (cluster-wide; idempotent so every database can run this file)
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in select * from (values
    ('anon',                       'nologin noinherit'),
    ('authenticated',              'nologin noinherit'),
    ('service_role',               'nologin noinherit bypassrls'),
    ('authenticator',              'login noinherit'),
    ('supabase_admin',             'login superuser createdb createrole replication bypassrls'),
    ('supabase_auth_admin',        'login noinherit createrole noreplication'),
    ('supabase_storage_admin',     'login noinherit createrole noreplication'),
    ('supabase_functions_admin',   'login noinherit createrole noreplication'),
    ('supabase_realtime_admin',    'nologin noinherit noreplication'),
    ('supabase_replication_admin', 'login replication'),
    ('supabase_read_only_user',    'login bypassrls'),
    ('dashboard_user',             'nologin createdb createrole replication'),
    ('pgbouncer',                  'login')
  ) as v(name, opts)
  loop
    if not exists (select 1 from pg_roles where rolname = r.name) then
      execute format('create role %I %s', r.name, r.opts);
    end if;
  end loop;
end
$$;

-- API roles inherit (Supabase 2023: alter role ... inherit), PostgREST switches into them.
alter role anon inherit;
alter role authenticated inherit;
alter role service_role inherit;
grant anon, authenticated, service_role to authenticator;
grant anon, authenticated, service_role to postgres;
grant pg_read_all_data to supabase_read_only_user;

-- Per-role settings as on Supabase (PostgREST applies them after SET ROLE;
-- a plain SET ROLE in psql does not).
alter role anon set statement_timeout = '3s';
alter role authenticated set statement_timeout = '8s';
alter role authenticator set statement_timeout = '8s';
-- Search paths: postgres as on Supabase; authenticator as PostgREST sets it
-- (exposed schema + db-extra-search-path "public, extensions").
alter role postgres set search_path to "$user", public, extensions;
alter role supabase_admin set search_path to "$user", public, auth, extensions;
alter role authenticator set search_path to public, extensions;
alter role supabase_auth_admin set search_path to auth;
alter role supabase_storage_admin set search_path to storage;

-- ---------------------------------------------------------------------------
-- 2. Schemas, extensions, public grants and default privileges
-- ---------------------------------------------------------------------------
create schema if not exists extensions;
grant usage on schema extensions to postgres, anon, authenticated, service_role;

create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_stat_statements with schema extensions;
-- Supabase Vault is preinstalled on hosted projects (stub: plaintext secrets).
create extension if not exists supabase_vault;
-- pg_net is NOT preinstalled here: migration 0019 creates it (stub).

grant usage on schema public to postgres, anon, authenticated, service_role;
-- Everything postgres (or supabase_admin) creates in public is granted to the
-- API roles, exactly as Supabase's default privileges do. RLS is what stands
-- between these grants and the data.
alter default privileges for role postgres in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges for role supabase_admin in schema public grant all on tables to postgres, anon, authenticated, service_role;
alter default privileges for role supabase_admin in schema public grant all on sequences to postgres, anon, authenticated, service_role;
alter default privileges for role supabase_admin in schema public grant all on functions to postgres, anon, authenticated, service_role;

-- Realtime publication (empty until the migrations add tables).
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 3. auth (GoTrue): the tables and helpers Polo touches
-- ---------------------------------------------------------------------------
create schema if not exists auth authorization supabase_admin;

create type auth.aal_level as enum ('aal1', 'aal2', 'aal3');
create type auth.factor_type as enum ('totp', 'webauthn', 'phone');
create type auth.factor_status as enum ('unverified', 'verified');
create type auth.code_challenge_method as enum ('s256', 'plain');
create type auth.one_time_token_type as enum ('confirmation_token', 'reauthentication_token', 'recovery_token',
  'email_change_token_new', 'email_change_token_current', 'phone_change_token');

-- Columns as in current GoTrue. Defaults on id/created_at/updated_at/aud/role/
-- metadata are a harness convenience (GoTrue always supplies them).
create table auth.users (
  instance_id uuid default '00000000-0000-0000-0000-000000000000',
  id uuid not null default gen_random_uuid(),
  aud varchar(255) default 'authenticated',
  role varchar(255) default 'authenticated',
  email varchar(255),
  encrypted_password varchar(255),
  email_confirmed_at timestamptz,
  invited_at timestamptz,
  confirmation_token varchar(255) default '',
  confirmation_sent_at timestamptz,
  recovery_token varchar(255) default '',
  recovery_sent_at timestamptz,
  email_change_token_new varchar(255) default '',
  email_change varchar(255) default '',
  email_change_sent_at timestamptz,
  last_sign_in_at timestamptz,
  raw_app_meta_data jsonb default '{}'::jsonb,
  raw_user_meta_data jsonb default '{}'::jsonb,
  is_super_admin boolean,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  phone text default null,
  phone_confirmed_at timestamptz,
  phone_change text default '',
  phone_change_token varchar(255) default '',
  phone_change_sent_at timestamptz,
  confirmed_at timestamptz generated always as (least(email_confirmed_at, phone_confirmed_at)) stored,
  email_change_token_current varchar(255) default '',
  email_change_confirm_status smallint default 0 check (email_change_confirm_status >= 0 and email_change_confirm_status <= 2),
  banned_until timestamptz,
  reauthentication_token varchar(255) default '',
  reauthentication_sent_at timestamptz,
  is_sso_user boolean not null default false,
  deleted_at timestamptz,
  is_anonymous boolean not null default false,
  constraint users_pkey primary key (id),
  constraint users_phone_key unique (phone)
);
create unique index users_email_partial_key on auth.users (email) where (is_sso_user = false);
create index users_instance_id_email_idx on auth.users (instance_id, lower((email)::text));
create index users_instance_id_idx on auth.users (instance_id);
create index users_is_anonymous_idx on auth.users (is_anonymous);
comment on table auth.users is 'Auth: Stores user login data within a secure schema.';

create table auth.identities (
  provider_id text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  identity_data jsonb not null,
  provider text not null,
  last_sign_in_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  email text generated always as (lower(identity_data ->> 'email')) stored,
  id uuid not null default gen_random_uuid() primary key,
  constraint identities_provider_id_provider_unique unique (provider_id, provider)
);
create index identities_user_id_idx on auth.identities (user_id);
create index identities_email_idx on auth.identities (email text_pattern_ops);

create table auth.sessions (
  id uuid not null default gen_random_uuid() primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  factor_id uuid,
  aal auth.aal_level,
  not_after timestamptz,
  refreshed_at timestamp,
  user_agent text,
  ip inet,
  tag text
);
create index sessions_user_id_idx on auth.sessions (user_id);
create index user_id_created_at_idx on auth.sessions (user_id, created_at);
create index sessions_not_after_idx on auth.sessions (not_after desc);

create table auth.refresh_tokens (
  instance_id uuid,
  id bigserial primary key,
  token varchar(255) unique,
  user_id varchar(255),
  revoked boolean,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  parent varchar(255),
  session_id uuid references auth.sessions (id) on delete cascade
);
create index refresh_tokens_instance_id_user_id_idx on auth.refresh_tokens (instance_id, user_id);
create index refresh_tokens_session_id_revoked_idx on auth.refresh_tokens (session_id, revoked);

create table auth.mfa_factors (
  id uuid not null primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  friendly_name text,
  factor_type auth.factor_type not null,
  status auth.factor_status not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  secret text,
  phone text,
  last_challenged_at timestamptz unique
);
create index factor_id_created_at_idx on auth.mfa_factors (user_id, created_at);

create table auth.mfa_challenges (
  id uuid not null primary key,
  factor_id uuid not null references auth.mfa_factors (id) on delete cascade,
  created_at timestamptz not null,
  verified_at timestamptz,
  ip_address inet not null,
  otp_code text
);

create table auth.mfa_amr_claims (
  session_id uuid not null references auth.sessions (id) on delete cascade,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  authentication_method text not null,
  id uuid not null primary key,
  constraint mfa_amr_claims_session_id_authentication_method_pkey unique (session_id, authentication_method)
);

create table auth.one_time_tokens (
  id uuid not null primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  token_type auth.one_time_token_type not null,
  token_hash text not null check (char_length(token_hash) > 0),
  relates_to text not null,
  created_at timestamp not null default now(),
  updated_at timestamp not null default now()
);

create table auth.audit_log_entries (
  instance_id uuid,
  id uuid not null primary key,
  payload json,
  created_at timestamptz,
  ip_address varchar(64) not null default ''
);

create table auth.instances (
  id uuid not null primary key,
  uuid uuid,
  raw_base_config text,
  created_at timestamptz,
  updated_at timestamptz
);

-- The JWT helpers, as in current GoTrue: the legacy per-claim GUC first, then
-- the request.jwt.claims JSON that PostgREST sets for each request.
create or replace function auth.uid()
returns uuid
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

create or replace function auth.role()
returns text
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;

create or replace function auth.email()
returns text
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.email', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email')
  )::text
$$;

create or replace function auth.jwt()
returns jsonb
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')
  )::jsonb
$$;

-- Ownership and grants as on Supabase: GoTrue owns auth; the API roles may
-- use the schema (for auth.uid() & co.) but have no table privileges.
do $$
declare
  r record;
begin
  -- (owned sequences, e.g. refresh_tokens_id_seq, follow their table)
  for r in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'auth' and c.relkind = 'r' loop
    execute format('alter table auth.%I owner to supabase_auth_admin', r.relname);
  end loop;
  for r in select t.typname from pg_type t join pg_namespace n on n.oid = t.typnamespace
           where n.nspname = 'auth' and t.typtype = 'e' loop
    execute format('alter type auth.%I owner to supabase_auth_admin', r.typname);
  end loop;
end
$$;
alter function auth.uid() owner to supabase_auth_admin;
alter function auth.role() owner to supabase_auth_admin;
alter function auth.email() owner to supabase_auth_admin;
alter function auth.jwt() owner to supabase_auth_admin;
alter schema auth owner to supabase_admin;
grant usage on schema auth to anon, authenticated, service_role;
grant all on schema auth to supabase_auth_admin, dashboard_user, postgres;
grant all on all tables in schema auth to supabase_auth_admin, dashboard_user, postgres;
grant all on all sequences in schema auth to supabase_auth_admin, dashboard_user, postgres;
grant execute on function auth.uid(), auth.role(), auth.email(), auth.jwt() to public;

-- ---------------------------------------------------------------------------
-- 4. storage (storage-api): buckets, objects, path helpers, RLS
-- ---------------------------------------------------------------------------
create schema if not exists storage authorization supabase_storage_admin;
grant usage on schema storage to postgres, anon, authenticated, service_role;
alter default privileges for role supabase_storage_admin in schema storage grant all on tables to postgres, anon, authenticated, service_role;
alter default privileges for role supabase_storage_admin in schema storage grant all on functions to postgres, anon, authenticated, service_role;
alter default privileges for role supabase_storage_admin in schema storage grant all on sequences to postgres, anon, authenticated, service_role;

set role supabase_storage_admin;

create type storage.buckettype as enum ('STANDARD', 'ANALYTICS');

create table storage.buckets (
  id text not null primary key,
  name text not null,
  owner uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  public boolean default false,
  avif_autodetection boolean default false,
  file_size_limit bigint,
  allowed_mime_types text[],
  owner_id text,
  type storage.buckettype not null default 'STANDARD'
);
create unique index bname on storage.buckets using btree (name);

create table storage.objects (
  id uuid not null default gen_random_uuid() primary key,
  bucket_id text references storage.buckets (id),
  name text,
  owner uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  last_accessed_at timestamptz default now(),
  metadata jsonb,
  path_tokens text[] generated always as (string_to_array(name, '/')) stored,
  version text,
  owner_id text,
  user_metadata jsonb,
  level integer
);
create unique index bucketid_objname on storage.objects using btree (bucket_id, name);
create index name_prefix_search on storage.objects (name text_pattern_ops);

create table storage.migrations (
  id integer primary key,
  name varchar(100) not null unique,
  hash varchar(40) not null,
  executed_at timestamp default current_timestamp
);

create or replace function storage.foldername(name text)
returns text[]
language plpgsql immutable
as $$
declare
  _parts text[];
begin
  select string_to_array(name, '/') into _parts;
  return _parts[1:array_length(_parts, 1) - 1];
end
$$;

create or replace function storage.filename(name text)
returns text
language plpgsql immutable
as $$
declare
  _parts text[];
begin
  select string_to_array(name, '/') into _parts;
  return _parts[array_length(_parts, 1)];
end
$$;

create or replace function storage.extension(name text)
returns text
language plpgsql immutable
as $$
declare
  _parts text[];
  _filename text;
begin
  select string_to_array(name, '/') into _parts;
  select _parts[array_length(_parts, 1)] into _filename;
  return reverse(split_part(reverse(_filename), '.', 1));
end
$$;

create or replace function storage.update_updated_at_column()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end
$$;
create trigger update_objects_updated_at before update on storage.objects
  for each row execute function storage.update_updated_at_column();

alter table storage.buckets enable row level security;
alter table storage.objects enable row level security;
alter table storage.migrations enable row level security;

reset role;

grant all on storage.buckets, storage.objects to postgres, anon, authenticated, service_role;
grant all on storage.migrations to postgres, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. realtime / graphql placeholders (nothing in Polo references them)
-- ---------------------------------------------------------------------------
create schema if not exists realtime;
create schema if not exists graphql_public;
grant usage on schema graphql_public to postgres, anon, authenticated, service_role;
