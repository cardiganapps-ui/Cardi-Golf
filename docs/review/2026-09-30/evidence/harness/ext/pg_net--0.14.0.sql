-- pg_net STUB (Polo review harness). Same objects and signatures as the real
-- pg_net the app relies on (net.http_post / http_get / http_delete, the
-- request queue, net._http_response), but there is no background worker:
-- nothing is ever sent. Every call is also copied, with its JSON body decoded,
-- into net.harness_requests so tests can see what a trigger would have sent.
\echo Use "CREATE EXTENSION pg_net" to load this file. \quit

create schema if not exists net;

create domain net.http_method as text
  check (value ilike 'get' or value ilike 'post' or value ilike 'delete');

-- Real pg_net: unlogged, drained by the worker. Here: logged and never drained.
create table net.http_request_queue (
  id bigserial,
  method net.http_method not null,
  url text not null,
  headers jsonb not null,
  body bytea,
  timeout_milliseconds integer not null
);

-- Real pg_net writes responses here; the stub never does (it stays empty,
-- which is what platform_health() reads as "no traffic").
create table net._http_response (
  id bigint,
  status_code integer,
  content_type text,
  headers jsonb,
  content text,
  timed_out boolean,
  error_msg text,
  created timestamptz not null default now()
);
create index _http_response_created_idx on net._http_response (created);

-- Harness-only capture (not in real pg_net).
create table net.harness_requests (
  id bigint primary key,
  created_at timestamptz not null default clock_timestamp(),
  method text not null,
  url text not null,
  headers jsonb not null,
  body jsonb,
  timeout_milliseconds integer not null,
  session_role text not null default session_user,
  jwt_claims text
);

create function net._urlencode_string(string varchar)
returns text
language sql immutable
as $$
  select coalesce(string_agg(
    case when b between 48 and 57 or b between 65 and 90 or b between 97 and 122 or b in (45, 46, 95, 126)
      then chr(b) else '%' || upper(lpad(to_hex(b), 2, '0')) end, '' order by i), '')
  from (
    select get_byte(convert_to(string, 'UTF8'), g) as b, g as i
    from generate_series(0, octet_length(convert_to(coalesce(string, ''), 'UTF8')) - 1) g
  ) x
$$;

create function net._encode_url_with_params_array(url text, params_array text[])
returns text
language sql immutable
as $$
  select case
    when params_array is null or cardinality(params_array) = 0 then url
    else url || case when strpos(url, '?') > 0 then '&' else '?' end || array_to_string(params_array, '&')
  end
$$;

create function net._harness_record(p_id bigint, p_method text, p_url text, p_headers jsonb, p_body jsonb, p_timeout integer)
returns void
language plpgsql
as $$
begin
  insert into net.harness_requests (id, method, url, headers, body, timeout_milliseconds, jwt_claims)
  values (p_id, p_method, p_url, p_headers, p_body, p_timeout, nullif(current_setting('request.jwt.claims', true), ''));
end
$$;

create function net.http_get(
  url text,
  params jsonb default '{}'::jsonb,
  headers jsonb default '{}'::jsonb,
  timeout_milliseconds integer default 5000
)
returns bigint
language plpgsql volatile
as $$
declare
  request_id bigint;
  params_array text[];
  full_url text;
begin
  select array_agg(format('%s=%s', net._urlencode_string(key), net._urlencode_string(value)))
  into params_array from jsonb_each_text(params);
  full_url := net._encode_url_with_params_array(url, params_array);
  insert into net.http_request_queue (method, url, headers, body, timeout_milliseconds)
  values ('GET', full_url, headers, null, timeout_milliseconds)
  returning id into request_id;
  perform net._harness_record(request_id, 'GET', full_url, headers, null, timeout_milliseconds);
  return request_id;
end
$$;

create function net.http_post(
  url text,
  body jsonb default '{}'::jsonb,
  params jsonb default '{}'::jsonb,
  headers jsonb default '{"Content-Type": "application/json"}'::jsonb,
  timeout_milliseconds integer default 5000
)
returns bigint
language plpgsql volatile
as $$
declare
  request_id bigint;
  params_array text[];
  content_type text;
  full_url text;
begin
  -- Same content-type rule as the real pg_net.
  select header_value into content_type
  from jsonb_each_text(coalesce(headers, '{}'::jsonb)) r(header_name, header_value)
  where lower(header_name) = 'content-type'
  limit 1;
  if content_type is null then
    select headers || '{"Content-Type": "application/json"}'::jsonb into headers;
  end if;
  if content_type <> 'application/json' then
    raise exception 'Content-Type header must be "application/json"';
  end if;
  select array_agg(format('%s=%s', net._urlencode_string(key), net._urlencode_string(value)))
  into params_array from jsonb_each_text(params);
  full_url := net._encode_url_with_params_array(url, params_array);
  insert into net.http_request_queue (method, url, headers, body, timeout_milliseconds)
  values ('POST', full_url, headers, convert_to(body::text, 'UTF8'), timeout_milliseconds)
  returning id into request_id;
  perform net._harness_record(request_id, 'POST', full_url, headers, body, timeout_milliseconds);
  return request_id;
end
$$;

create function net.http_delete(
  url text,
  params jsonb default '{}'::jsonb,
  headers jsonb default '{}'::jsonb,
  timeout_milliseconds integer default 5000
)
returns bigint
language plpgsql volatile
as $$
declare
  request_id bigint;
  params_array text[];
  full_url text;
begin
  select array_agg(format('%s=%s', net._urlencode_string(key), net._urlencode_string(value)))
  into params_array from jsonb_each_text(params);
  full_url := net._encode_url_with_params_array(url, params_array);
  insert into net.http_request_queue (method, url, headers, body, timeout_milliseconds)
  values ('DELETE', full_url, headers, null, timeout_milliseconds)
  returning id into request_id;
  perform net._harness_record(request_id, 'DELETE', full_url, headers, null, timeout_milliseconds);
  return request_id;
end
$$;

-- What Supabase's `extensions.grant_pg_net_access()` event trigger does when
-- pg_net is created: http_get/http_post become SECURITY DEFINER with a pinned
-- search_path, lose PUBLIC, and are granted to the API roles.
grant usage on schema net to supabase_functions_admin, postgres, anon, authenticated, service_role;
alter function net.http_get(text, jsonb, jsonb, integer) security definer;
alter function net.http_post(text, jsonb, jsonb, jsonb, integer) security definer;
alter function net.http_get(text, jsonb, jsonb, integer) set search_path = net;
alter function net.http_post(text, jsonb, jsonb, jsonb, integer) set search_path = net;
revoke all on function net.http_get(text, jsonb, jsonb, integer) from public;
revoke all on function net.http_post(text, jsonb, jsonb, jsonb, integer) from public;
grant execute on function net.http_get(text, jsonb, jsonb, integer) to supabase_functions_admin, postgres, anon, authenticated, service_role;
grant execute on function net.http_post(text, jsonb, jsonb, jsonb, integer) to supabase_functions_admin, postgres, anon, authenticated, service_role;
