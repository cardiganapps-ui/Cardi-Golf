-- supabase_vault STUB (Polo review harness). Same objects and signatures the
-- app uses (vault.secrets, vault.decrypted_secrets, vault.create_secret,
-- vault.update_secret). Secrets are NOT encrypted here: decrypted_secret is
-- the stored text. Access mirrors Supabase: postgres only, never the API roles.
\echo Use "CREATE EXTENSION supabase_vault" to load this file. \quit

create table vault.secrets (
  id uuid not null default gen_random_uuid() primary key,
  name text,
  description text not null default '',
  secret text not null,
  key_id uuid,
  nonce bytea,
  created_at timestamptz not null default current_timestamp,
  updated_at timestamptz not null default current_timestamp
);
create unique index secrets_name_idx on vault.secrets (name) where name is not null;

create view vault.decrypted_secrets as
  select s.id, s.name, s.description, s.secret, s.secret as decrypted_secret,
         s.key_id, s.nonce, s.created_at, s.updated_at
  from vault.secrets s;

create function vault.create_secret(new_secret text, new_name text default null, new_description text default '', new_key_id uuid default null)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  rec record;
begin
  insert into vault.secrets (secret, name, description, key_id)
  values (new_secret, new_name, coalesce(new_description, ''), new_key_id)
  returning * into rec;
  return rec.id;
end
$$;

create function vault.update_secret(secret_id uuid, new_secret text default null, new_name text default null, new_description text default null, new_key_id uuid default null)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  update vault.secrets s
  set secret = coalesce(new_secret, s.secret),
      name = coalesce(new_name, s.name),
      description = coalesce(new_description, s.description),
      key_id = coalesce(new_key_id, s.key_id),
      updated_at = now()
  where s.id = secret_id;
end
$$;

revoke all on schema vault from public;
revoke all on function vault.create_secret(text, text, text, uuid) from public;
revoke all on function vault.update_secret(uuid, text, text, text, uuid) from public;
grant usage on schema vault to postgres with grant option;
grant select, delete on vault.secrets to postgres with grant option;
grant select on vault.decrypted_secrets to postgres with grant option;
grant execute on function vault.create_secret(text, text, text, uuid) to postgres with grant option;
grant execute on function vault.update_secret(uuid, text, text, text, uuid) to postgres with grant option;
