#!/usr/bin/env bash
# Approve / remove / list Archery Calendar submitters via public.bot_manage_submitter (no service-role key).
# Usage: ARCHCAL_BOT_TOKEN=... scripts/bot_approve.sh approve|remove|list [email|@domain] [name] [club]
set -euo pipefail
: "${ARCHCAL_BOT_TOKEN:?set ARCHCAL_BOT_TOKEN}"
act="${1:?approve|remove|list}"; email="${2:-}"; name="${3:-}"; club="${4:-}"
cfg="$(dirname "$0")/../config.js"
url="${SUPABASE_URL:-$(grep -oE "SUPABASE_URL *= *['\"][^'\"]+" "$cfg" | grep -oE "https://[^'\"]+")}"
key="${SUPABASE_ANON_KEY:-$(grep -oE "SUPABASE_ANON_KEY *= *['\"][^'\"]+" "$cfg" | sed -E "s/.*['\"]//")}"
body=$(python3 -c 'import json,sys; a=sys.argv[1:]; print(json.dumps({"p_token":a[0],"p_action":a[1],"p_email":a[2] or None,"p_name":a[3] or None,"p_club":a[4] or None}))' "$ARCHCAL_BOT_TOKEN" "$act" "$email" "$name" "$club")
curl -sS -X POST "${url%/}/rest/v1/rpc/bot_manage_submitter" -H "apikey: $key" -H "Authorization: Bearer $key" -H "Content-Type: application/json" -d "$body"
echo
