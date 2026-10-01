#!/usr/bin/env bash
# Keep the free Supabase project awake (DB-01): one real query through the
# anon role. Fails unless the database answers 200 with the flags object.
#   SUPABASE_URL=… SUPABASE_ANON_KEY=… bash scripts/keepalive.sh
set -euo pipefail
: "${SUPABASE_URL:?}" "${SUPABASE_ANON_KEY:?}"
body="$(mktemp)"
code="$(curl -sS -o "$body" -w '%{http_code}' -X POST \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H 'Content-Type: application/json' \
  -d '{}' \
  "$SUPABASE_URL/rest/v1/rpc/app_flags")"
echo "app_flags responded $code: $(head -c 200 "$body")"
[ "$code" = "200" ] && grep -q '"maintenanceBanner"' "$body"
